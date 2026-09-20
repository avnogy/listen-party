package server

import (
	"context"
	"listen-party/backend/app/commands"
	httpapi "listen-party/backend/http"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
	"log/slog"
	"net/http"
)

func (s *Server) SavePlayback(ctx context.Context, room *rooms.Room) error {
	return s.savePlayback(ctx, room)
}
func (s *Server) StabilizeAndSchedulePlayback(ctx context.Context, room *rooms.Room, state playback.PlaybackState) playback.PlaybackState {
	return s.stabilizeAndSchedulePlayback(ctx, room, state)
}
func (s *Server) WriteCommandState(w http.ResponseWriter, r *http.Request, event string, room *rooms.Room, username string, state playback.PlaybackState) {
	s.writeCommandState(w, r, event, room, username, state)
}

func permissionForAction(action string) (rooms.RoomPermission, bool) {
	return commands.PermissionForAction(action)
}

func (s *Server) writeCommandState(w http.ResponseWriter, r *http.Request, event string, room *rooms.Room, username string, state playback.PlaybackState) {
	state = s.stabilizeAndSchedulePlayback(r.Context(), room, state)
	if err := s.savePlayback(r.Context(), room); err != nil {
		slog.Error("save playback state", "remote", r.RemoteAddr, "room", room.ID, "error", err)
		http.Error(w, "save playback state", http.StatusInternalServerError)
		return
	}
	view, err := s.ViewStateForRequest(r, state)
	if err != nil {
		slog.Warn("build view state", "remote", r.RemoteAddr, "error", err)
		httpapi.WriteError(w, err)
		return
	}
	slog.Info("playback action",
		"action", event,
		"username", username,
		"remote", r.RemoteAddr,
		"room", room.ID,
	)
	httpapi.WriteJSON(w, view)
}
