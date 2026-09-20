package main

import (
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"

	"listen-party/backend/config"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/rooms"
)

type Server struct {
	Auth           AuthGate
	AuthRoutes     http.Handler
	Library        *musiclib.Library
	Rooms          *rooms.RoomManager
	Config         config.Config
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

func (s *Server) roomFromRequest(w http.ResponseWriter, r *http.Request) (*rooms.Room, UserInfo, bool) {
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
