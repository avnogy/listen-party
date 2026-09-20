package server

import (
	"log/slog"
	"net/http"
	"path/filepath"

	"listen-party/backend/config"
	httpapi "listen-party/backend/http"
)

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	s.configMu.RLock()
	cfg := s.Config
	s.configMu.RUnlock()
	httpapi.WriteJSON(w, cfg)
}

func (s *Server) handleConfigUpdate(w http.ResponseWriter, r *http.Request) {
	var cfg config.Config
	if !httpapi.ReadJSON(w, r, &cfg) {
		return
	}
	s.configUpdateMu.Lock()
	defer s.configUpdateMu.Unlock()
	s.configMu.RLock()
	old := s.Config
	path := s.ConfigPath
	s.configMu.RUnlock()
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

	if err := config.SaveConfig(path, cfg); err != nil {
		slog.Warn("save config failed", "remote", r.RemoteAddr, "path", path, "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.Library.UpdateScanConfig(cfg.MusicDirs, cfg.ScanWorkers)
	for _, removedID := range removedRoomIDs(old.Rooms, cfg.Rooms) {
		if err := s.Library.DeleteRoomPlaybackSnapshot(r.Context(), removedID); err != nil {
			slog.Warn("delete removed room playback state", "room", removedID, "error", err)
		}
	}
	s.Rooms.Update(cfg.Rooms)

	s.configMu.Lock()
	s.Config = cfg
	s.configMu.Unlock()

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
