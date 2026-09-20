package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"

	musiclib "listen-party/internal/library"
)

type Server struct {
	Auth           AuthGate
	AuthRoutes     http.Handler
	Library        *musiclib.Library
	Rooms          *RoomManager
	Config         Config
	ConfigPath     string
	configMu       sync.RWMutex
	configUpdateMu sync.Mutex
	viewCacheMu    sync.Mutex
	viewCache      map[string]viewTrackCache
}

type viewTrackCache struct {
	revision uint64
	tracks   map[string]musiclib.Track
}

const maxFolderImportFiles = 50_000
const maxRoomVolume = 0.5

func (s *Server) rejectBannedIPs(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		ip, ok := clientIP(r.RemoteAddr)
		if ok && s.ipIsBanned(ip) {
			slog.Warn("blocked banned ip", "remote", r.RemoteAddr, "ip", ip.String(), "path", r.URL.Path)
			http.Error(w, "You are not allowed to access this resource, and have been banned due to suspicious activity.", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) ipIsBanned(ip netip.Addr) bool {
	s.configMu.RLock()
	banned := append([]string(nil), s.Config.BannedIPs...)
	s.configMu.RUnlock()
	for _, value := range banned {
		bannedIP, err := netip.ParseAddr(value)
		if err == nil && bannedIP == ip {
			return true
		}
	}
	return false
}

func clientIP(remoteAddr string) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = strings.Trim(remoteAddr, "[]")
	}
	ip, err := netip.ParseAddr(host)
	return ip, err == nil
}

func isAuthRoute(path string) bool {
	for _, prefix := range []string{
		"/login",
		"/logout",
		"/authAdmin",
		"/_",
		"/api/backups",
		"/api/batch",
		"/api/collections",
		"/api/crons",
		"/api/files",
		"/api/health",
		"/api/logs",
		"/api/oauth2-redirect",
		"/api/realtime",
		"/api/settings",
		"/api/sql",
	} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

func (s *Server) roomFromRequest(w http.ResponseWriter, r *http.Request) (*Room, UserInfo, bool) {
	roomID := r.PathValue("room")
	if roomID == "" {
		roomID = s.Rooms.DefaultID()
	}
	room, ok := s.Rooms.Get(roomID)
	if !ok {
		http.Error(w, "room not found", http.StatusNotFound)
		return nil, UserInfo{}, false
	}
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return nil, UserInfo{}, false
	}
	return room, user, true
}

type ViewState struct {
	PlaybackState
	Current     *ViewItem        `json:"current"`
	Queue       []ViewItem       `json:"queue"`
	History     []ViewItem       `json:"history"`
	Permissions []RoomPermission `json:"permissions"`
}

type ViewItem struct {
	PlaybackItem
	Track *musiclib.Track `json:"track"`
}

func (s *Server) viewState(ctx context.Context, state PlaybackState) (ViewState, error) {
	keys := make([]string, 0, len(state.Queue)+len(state.History)+1)
	if state.Current.DedupeKey != "" {
		keys = append(keys, state.Current.DedupeKey)
	}
	for _, item := range state.Queue {
		keys = append(keys, item.DedupeKey)
	}
	for _, item := range state.History {
		keys = append(keys, item.DedupeKey)
	}
	tracks, err := s.cachedViewTracks(ctx, state, keys)
	if err != nil {
		return ViewState{}, err
	}
	view := ViewState{PlaybackState: state}
	view.Queue = make([]ViewItem, 0, len(state.Queue))
	view.History = make([]ViewItem, 0, len(state.History))
	if state.Current.DedupeKey != "" {
		view.Current = &ViewItem{PlaybackItem: state.Current}
		if track, ok := tracks[state.Current.DedupeKey]; ok {
			view.Current.Track = &track
		}
	}
	for _, item := range state.Queue {
		viewItem := ViewItem{PlaybackItem: item}
		if track, ok := tracks[item.DedupeKey]; ok {
			viewItem.Track = &track
		}
		view.Queue = append(view.Queue, viewItem)
	}
	for _, item := range state.History {
		viewItem := ViewItem{PlaybackItem: item}
		if track, ok := tracks[item.DedupeKey]; ok {
			viewItem.Track = &track
		}
		view.History = append(view.History, viewItem)
	}
	return view, nil
}

func (s *Server) cachedViewTracks(ctx context.Context, state PlaybackState, keys []string) (map[string]musiclib.Track, error) {
	s.viewCacheMu.Lock()
	defer s.viewCacheMu.Unlock()
	if cached, ok := s.viewCache[state.RoomID]; ok {
		if cached.revision == state.Revision {
			return cached.tracks, nil
		}
		if cached.revision > state.Revision {
			return s.Library.ListByDedupeKeys(ctx, keys)
		}
	}
	tracks, err := s.Library.ListByDedupeKeys(ctx, keys)
	if err != nil {
		return nil, err
	}
	if s.viewCache == nil {
		s.viewCache = make(map[string]viewTrackCache)
	}
	s.viewCache[state.RoomID] = viewTrackCache{revision: state.Revision, tracks: tracks}
	return tracks, nil
}

func (s *Server) invalidateViewCache() {
	s.viewCacheMu.Lock()
	clear(s.viewCache)
	s.viewCacheMu.Unlock()
}

func (s *Server) viewStateForRequest(r *http.Request, state PlaybackState) (ViewState, error) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		return ViewState{}, errors.New("authentication required")
	}
	permissions, ok := s.Rooms.PermissionsForUser(state.RoomID, user)
	if !ok {
		return ViewState{}, errors.New("room not found")
	}
	view, err := s.viewState(r.Context(), state)
	if err != nil {
		return ViewState{}, err
	}
	view.Permissions = permissions
	return view, nil
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return false
	}
	return true
}

func writeError(w http.ResponseWriter, err error) {
	if errors.Is(err, musiclib.ErrTrackNotFound) || errors.Is(err, musiclib.ErrPlaylistNotFound) {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
