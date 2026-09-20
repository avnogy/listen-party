package configuration

import (
	"log/slog"
	"net/http"
	"path/filepath"

	domainconfig "listen-party/backend/config"
	httpapi "listen-party/backend/http"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/rooms"
)

type Host interface {
	ConfigSnapshot() (domainconfig.Config, string)
	LockConfigUpdate() func()
	SetConfig(domainconfig.Config)
	LibraryStore() *musiclib.Library
	RoomStore() *rooms.RoomManager
}

func Handle(w http.ResponseWriter, r *http.Request, host Host) {
	cfg, _ := host.ConfigSnapshot()
	httpapi.WriteJSON(w, cfg)
}

func HandleUpdate(w http.ResponseWriter, r *http.Request, host Host) {
	var cfg domainconfig.Config
	if !httpapi.ReadJSON(w, r, &cfg) {
		return
	}
	unlockUpdate := host.LockConfigUpdate()
	defer unlockUpdate()
	old, path := host.ConfigSnapshot()
	if cfg.Revision != old.Revision {
		http.Error(w, "configuration changed; reload before saving", http.StatusConflict)
		return
	}
	cfg.Revision = old.Revision + 1

	if err := cfg.ApplyDefaultsForRoot(filepath.Dir(path)); err != nil {
		slog.Warn("reject config update", "remote", r.RemoteAddr, "error", err)
		httpapi.WriteError(w, err)
		return
	}

	if err := domainconfig.SaveConfig(path, cfg); err != nil {
		slog.Warn("save config failed", "remote", r.RemoteAddr, "path", path, "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	host.LibraryStore().UpdateScanConfig(cfg.MusicDirs, cfg.ScanWorkers)
	for _, removedID := range removedRoomIDs(old.Rooms, cfg.Rooms) {
		if err := host.LibraryStore().DeleteRoomPlaybackSnapshot(r.Context(), removedID); err != nil {
			slog.Warn("delete removed room playback state", "room", removedID, "error", err)
		}
	}
	host.RoomStore().Update(cfg.Rooms)
	host.SetConfig(cfg)

	slog.Info("config updated",
		"remote", r.RemoteAddr,
		"path", path,
		"addr_changed", cfg.Addr != old.Addr,
		"auth_changed", cfg.Auth.PocketBase != old.Auth.PocketBase,
		"music_dirs", len(cfg.MusicDirs),
		"scan_workers", cfg.ScanWorkers,
	)
	httpapi.WriteJSON(w, cfg)
}

func removedRoomIDs(oldRooms, newRooms []rooms.Room) []string {
	remaining := make(map[string]struct{}, len(newRooms))
	for _, room := range newRooms {
		remaining[room.ID] = struct{}{}
	}
	removed := make([]string, 0)
	for _, room := range oldRooms {
		if _, ok := remaining[room.ID]; !ok {
			removed = append(removed, room.ID)
		}
	}
	return removed
}
