package server

import (
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

import (
	httpapi "listen-party/backend/http"
	musiclib "listen-party/backend/internal/library"
)

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	room, user, ok := s.roomFromRequest(w, r)
	if !ok {
		return
	}
	if room.Playback.ListenerDisconnected(user) {
		http.Error(w, "session disconnected; sign in again", http.StatusConflict)
		return
	}
	state, err := s.viewStateForRequest(r, room.Playback.Snapshot())
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, state)
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	tracks, err := s.Library.SearchField(r.Context(), q, r.URL.Query().Get("field"))
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, tracks)
}

func (s *Server) handleLibrary(w http.ResponseWriter, r *http.Request) {
	count, err := s.Library.Count(r.Context())
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, map[string]any{
		"track_count": count,
		"scan":        s.Library.ScanStatus(),
	})
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(name), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return 0, false
	}
	return id, true
}

func (s *Server) handleRescan(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	slog.Info("library rescan started", "remote", r.RemoteAddr)
	err := s.Library.Scan(r.Context())
	s.invalidateViewCache()
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
	count, err := s.Library.Count(r.Context())
	if err != nil {
		slog.Warn("count library after rescan", "remote", r.RemoteAddr, "duration", time.Since(started), "error", err)
	} else {
		slog.Info("library rescan completed", "remote", r.RemoteAddr, "duration", time.Since(started), "tracks", count)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRescanDir(w http.ResponseWriter, r *http.Request) {
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
	s.configMu.RLock()
	configured := append([]string(nil), s.Config.MusicDirs...)
	s.configMu.RUnlock()
	if !slices.Contains(configured, dir) {
		http.Error(w, "music_dir must match a configured music directory", http.StatusBadRequest)
		return
	}

	started := time.Now()
	slog.Info("library directory rescan started", "remote", r.RemoteAddr, "music_dir", dir)
	err := s.Library.ScanDir(r.Context(), dir)
	s.invalidateViewCache()
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
	count, err := s.Library.Count(r.Context())
	if err != nil {
		slog.Warn("count library after directory rescan", "remote", r.RemoteAddr, "music_dir", dir, "duration", time.Since(started), "error", err)
	} else {
		slog.Info("library directory rescan completed", "remote", r.RemoteAddr, "music_dir", dir, "duration", time.Since(started), "tracks", count)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid media id", http.StatusBadRequest)
		return
	}
	media, err := s.Library.OpenMedia(r.Context(), id)
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

func (s *Server) handleArtwork(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid media id", http.StatusBadRequest)
		return
	}
	data, mimeType, err := s.Library.Artwork(r.Context(), id)
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
