package main

import (
	"net/http"

	musiclib "listen-party/backend/internal/library"
)

func (s *Server) handleApp(w http.ResponseWriter, r *http.Request) {
	if r.PathValue("room") != "" {
		if _, _, ok := s.roomFromRequest(w, r); !ok {
			return
		}
	}
	http.ServeFileFS(w, r, webRoot(), "index.html")
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	rooms := s.Rooms.List()
	type roomSummary struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	summaries := make([]roomSummary, 0, len(rooms))
	permissions := make(map[string][]RoomPermission, len(rooms))
	administration := make(map[string]bool, len(rooms))
	disconnected := make(map[string]bool, len(rooms))
	for _, room := range rooms {
		summaries = append(summaries, roomSummary{ID: room.ID, Name: room.Name})
		permissions[room.ID] = RoomPermissionsForUser(user, room)
		administration[room.ID] = UserIsRoomAdmin(user, room)
		if activeRoom, ok := s.Rooms.Get(room.ID); ok {
			disconnected[room.ID] = activeRoom.Playback.ListenerDisconnected(user)
		}
	}
	writeJSON(w, map[string]any{
		"audio_extensions": musiclib.AudioExtensions(), "default_room_id": s.Rooms.DefaultID(),
		"rooms": summaries, "permissions": permissions, "room_administration": administration,
		"disconnected": disconnected, "user": user,
	})
}

func (s *Server) handleAdminPage(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, adminRoot(), "admin.html")
}
func (s *Server) handleAdminJS(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, adminRoot(), "admin.js")
}
func (s *Server) handleFavicon(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, webRoot(), "favicon.ico")
}
