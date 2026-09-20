package media

import (
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"listen-party/backend/config"
)

import (
	appauth "listen-party/backend/auth"
	httpapi "listen-party/backend/http"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
)

type Host interface {
	RoomFromRequest(http.ResponseWriter, *http.Request) (*rooms.Room, appauth.UserInfo, bool)
	LibraryStore() *musiclib.Library
	ConfigSnapshot() (config.Config, string)
	InvalidateViewCache()
	ViewStateForRequest(*http.Request, playback.PlaybackState) (any, error)
}

func HandleState(w http.ResponseWriter, r *http.Request, host Host) {
	room, user, ok := host.RoomFromRequest(w, r)
	if !ok {
		return
	}
	if room.Playback.ListenerDisconnected(user) {
		http.Error(w, "session disconnected; sign in again", http.StatusConflict)
		return
	}
	state, err := host.ViewStateForRequest(r, room.Playback.Snapshot())
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, state)
}

func HandleSearch(w http.ResponseWriter, r *http.Request, host Host) {
	q := r.URL.Query().Get("q")
	tracks, err := host.LibraryStore().SearchField(r.Context(), q, r.URL.Query().Get("field"))
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, tracks)
}

func HandleLibrary(w http.ResponseWriter, r *http.Request, host Host) {
	count, err := host.LibraryStore().Count(r.Context())
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, map[string]any{
		"track_count": count,
		"scan":        host.LibraryStore().ScanStatus(),
	})
}

func PathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

func HandleRescan(w http.ResponseWriter, r *http.Request, host Host) {
	started := time.Now()
	slog.Info("library rescan started", "remote", r.RemoteAddr)
	err := host.LibraryStore().Scan(r.Context())
	host.InvalidateViewCache()
	if err != nil {
		if errors.Is(err, musiclib.ErrScanInProgress) {
			slog.Info("library rescan ignored; already scanning", "remote", r.RemoteAddr)
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		slog.Warn("library rescan failed", "remote", r.RemoteAddr, "duration", time.Since(started), "error", err)
		httpapi.WriteError(w, err)
		return
	}
	count, err := host.LibraryStore().Count(r.Context())
	if err != nil {
		slog.Warn("count library after rescan", "remote", r.RemoteAddr, "duration", time.Since(started), "error", err)
	} else {
		slog.Info("library rescan completed", "remote", r.RemoteAddr, "duration", time.Since(started), "tracks", count)
	}
	w.WriteHeader(http.StatusNoContent)
}

func HandleRescanDir(w http.ResponseWriter, r *http.Request, host Host) {
	var req struct {
		MusicDir string `json:"music_dir"`
	}
	if !httpapi.ReadJSON(w, r, &req) {
		return
	}
	dir := strings.TrimSpace(req.MusicDir)
	if dir == "" {
		http.Error(w, "music_dir is required", http.StatusBadRequest)
		return
	}
	cfg, _ := host.ConfigSnapshot()
	configured := append([]string(nil), cfg.MusicDirs...)
	if !slices.Contains(configured, dir) {
		http.Error(w, "music_dir must match a configured music directory", http.StatusBadRequest)
		return
	}

	started := time.Now()
	slog.Info("library directory rescan started", "remote", r.RemoteAddr, "music_dir", dir)
	err := host.LibraryStore().ScanDir(r.Context(), dir)
	host.InvalidateViewCache()
	if err != nil {
		if errors.Is(err, musiclib.ErrScanInProgress) {
			slog.Info("library directory rescan ignored; already scanning", "remote", r.RemoteAddr, "music_dir", dir)
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		slog.Warn("library directory rescan failed", "remote", r.RemoteAddr, "music_dir", dir, "duration", time.Since(started), "error", err)
		httpapi.WriteError(w, err)
		return
	}
	count, err := host.LibraryStore().Count(r.Context())
	if err != nil {
		slog.Warn("count library after directory rescan", "remote", r.RemoteAddr, "music_dir", dir, "duration", time.Since(started), "error", err)
	} else {
		slog.Info("library directory rescan completed", "remote", r.RemoteAddr, "music_dir", dir, "duration", time.Since(started), "tracks", count)
	}
	w.WriteHeader(http.StatusNoContent)
}

func HandleMedia(w http.ResponseWriter, r *http.Request, host Host) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid media id", http.StatusBadRequest)
		return
	}
	media, err := host.LibraryStore().OpenMedia(r.Context(), id)
	if err != nil {
		if errors.Is(err, musiclib.ErrTrackNotFound) {
			slog.Warn("media track not found", "remote", r.RemoteAddr, "track_id", id)
			http.NotFound(w, r)
			return
		}
		slog.Warn("load media track", "remote", r.RemoteAddr, "track_id", id, "error", err)
		httpapi.WriteError(w, err)
		return
	}
	defer media.Close()
	w.Header().Set("Content-Type", media.ContentType())
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, media.Name(), media.ModTime(), media)
}

func HandleArtwork(w http.ResponseWriter, r *http.Request, host Host) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid media id", http.StatusBadRequest)
		return
	}
	data, mimeType, err := host.LibraryStore().Artwork(r.Context(), id)
	if err != nil {
		if errors.Is(err, musiclib.ErrTrackNotFound) {
			http.NotFound(w, r)
			return
		}
		slog.Warn("load media artwork", "remote", r.RemoteAddr, "track_id", id, "error", err)
		httpapi.WriteError(w, err)
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Write(data)
}
