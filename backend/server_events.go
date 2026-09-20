package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	room, user, ok := s.roomFromRequest(w, r)
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
			if !ok || !s.writeEvent(w, r, state) {
				return
			}
		case <-ticker.C:
			if !writePing(w) {
				return
			}
		}
	}
}

func writePing(w http.ResponseWriter) bool {
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

func (s *Server) writeEvent(w http.ResponseWriter, r *http.Request, state PlaybackState) bool {
	if state.Disconnect {
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
	payload, err := s.viewStateForRequest(r, state)
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
