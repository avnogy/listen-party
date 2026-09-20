package main

import (
	"errors"
	"log/slog"
	"net/http"
)

var errAutoDJConfigurationChanged = errors.New("auto-dj configuration changed")

func (s *Server) writeCommandState(w http.ResponseWriter, r *http.Request, event string, room *Room, username string, state PlaybackState) {
	state = s.stabilizeAndSchedulePlayback(r.Context(), room, state)
	if err := s.savePlayback(r.Context(), room); err != nil {
		slog.Error("save playback state", "remote", r.RemoteAddr, "room", room.ID, "error", err)
		http.Error(w, "save playback state", http.StatusInternalServerError)
		return
	}
	view, err := s.viewStateForRequest(r, state)
	if err != nil {
		slog.Warn("build view state", "remote", r.RemoteAddr, "error", err)
		writeError(w, err)
		return
	}
	slog.Info("playback action",
		"action", event,
		"username", username,
		"remote", r.RemoteAddr,
		"room", room.ID,
	)
	writeJSON(w, view)
}
