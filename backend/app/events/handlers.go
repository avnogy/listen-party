package events

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	appauth "listen-party/backend/auth"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
)

type Host interface {
	RoomFromRequest(http.ResponseWriter, *http.Request) (*rooms.Room, appauth.UserInfo, bool)
	ViewStateForRequest(*http.Request, playback.PlaybackState) (any, error)
}

func Handle(w http.ResponseWriter, r *http.Request, host Host) {
	room, user, ok := host.RoomFromRequest(w, r)
	if !ok {
		return
	}
	ch, cancel, allowed := room.Playback.SubscribeIfAllowed(user)
	if !allowed {
		http.Error(w, "session disconnected; sign in again", http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	defer cancel()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	lifetime := time.NewTimer(10 * time.Minute)
	defer lifetime.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-lifetime.C:
			return
		case state, ok := <-ch:
			if !ok || !writeEvent(w, r, state, host) {
				return
			}
		case <-ticker.C:
			if !WritePing(w) {
				return
			}
		}
	}
}

func WritePing(w http.ResponseWriter) bool {
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		slog.Debug("set sse ping write deadline", "error", err)
	}
	if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
		slog.Warn("write sse ping", "error", err)
		return false
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return true
}

func WriteDisconnect(w http.ResponseWriter) bool {
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		slog.Debug("set sse disconnect write deadline", "error", err)
	}
	if _, err := fmt.Fprint(w, "event: disconnect\ndata: {}\n\n"); err != nil {
		slog.Warn("write sse disconnect", "error", err)
		return false
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return true
}

func writeEvent(w http.ResponseWriter, r *http.Request, state playback.PlaybackState, host Host) bool {
	if state.Disconnect {
		return WriteDisconnect(w)
	}
	payload, err := host.ViewStateForRequest(r, state)
	if err != nil {
		slog.Warn("build sse state", "error", err)
		return false
	}
	if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		slog.Debug("set sse write deadline", "error", err)
	}
	fmt.Fprint(w, "event: state\ndata: ")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Warn("write sse state", "error", err)
		return false
	}
	fmt.Fprint(w, "\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return true
}
