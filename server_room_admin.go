package main

import (
	"log/slog"
	"net/http"
	"strings"
)

func (s *Server) handleRoomAdmin(w http.ResponseWriter, r *http.Request) {
	room, user, ok := s.roomFromRequest(w, r)
	if !ok {
		return
	}
	if !UserIsRoomAdmin(user, *room) {
		http.Error(w, "room administration denied", http.StatusForbidden)
		return
	}
	users, err := s.Auth.ListEnabledUsers()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, map[string]any{
		"id":             room.ID,
		"name":           room.Name,
		"grants":         cloneRoomGrants(room.Grants),
		"user_overrides": cloneRoomGrants(room.UserOverrides),
		"users":          users,
	})
}

func (s *Server) handleRoomAdminUpdate(w http.ResponseWriter, r *http.Request) {
	room, user, ok := s.roomFromRequest(w, r)
	if !ok {
		return
	}
	if !UserIsRoomAdmin(user, *room) {
		http.Error(w, "room administration denied", http.StatusForbidden)
		return
	}
	var req struct {
		Grants        map[string][]RoomPermission `json:"grants"`
		UserOverrides map[string][]RoomPermission `json:"user_overrides"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	s.configUpdateMu.Lock()
	defer s.configUpdateMu.Unlock()

	s.configMu.RLock()
	cfg := cloneConfig(s.Config)
	configPath := s.ConfigPath
	s.configMu.RUnlock()
	found := false
	for i := range cfg.Rooms {
		if cfg.Rooms[i].ID == room.ID {
			if !UserIsRoomAdmin(user, cfg.Rooms[i]) {
				http.Error(w, "room administration denied", http.StatusForbidden)
				return
			}
			cfg.Rooms[i].Grants = normalizeRoomGrants(req.Grants)
			cfg.Rooms[i].UserOverrides = req.UserOverrides
			found = true
			break
		}
	}
	if !found {
		http.Error(w, "room not found", http.StatusNotFound)
		return
	}
	cfg.Revision++
	if err := SaveConfig(configPath, cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.Rooms.Update(cfg.Rooms)
	s.configMu.Lock()
	s.Config = cfg
	s.configMu.Unlock()
	updated, _ := s.Rooms.Get(room.ID)
	writeJSON(w, map[string]any{
		"id":             updated.ID,
		"name":           updated.Name,
		"grants":         cloneRoomGrants(updated.Grants),
		"user_overrides": cloneRoomGrants(updated.UserOverrides),
	})
}

func (s *Server) handleRoomAdminDisconnect(w http.ResponseWriter, r *http.Request) {
	room, user, ok := s.roomFromRequest(w, r)
	if !ok {
		return
	}
	if !UserIsRoomAdmin(user, *room) {
		http.Error(w, "room administration denied", http.StatusForbidden)
		return
	}
	var req struct {
		Username string `json:"username"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	if !room.Playback.DisconnectListener(req.Username) {
		http.Error(w, "listener not found", http.StatusNotFound)
		return
	}
	slog.Info("listener disconnected by room administrator", "room", room.ID, "username", req.Username, "administrator", user.Username)
	w.WriteHeader(http.StatusNoContent)
}

func cloneConfig(cfg Config) Config {
	cfg.MusicDirs = append([]string(nil), cfg.MusicDirs...)
	cfg.BannedIPs = append([]string(nil), cfg.BannedIPs...)
	cfg.Rooms = append([]Room(nil), cfg.Rooms...)
	for i := range cfg.Rooms {
		cfg.Rooms[i].AdminGroups = append([]string(nil), cfg.Rooms[i].AdminGroups...)
		cfg.Rooms[i].Grants = cloneRoomGrants(cfg.Rooms[i].Grants)
		cfg.Rooms[i].UserOverrides = cloneRoomGrants(cfg.Rooms[i].UserOverrides)
	}
	return cfg
}

func removedRoomIDs(oldRooms, newRooms []Room) []string {
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
