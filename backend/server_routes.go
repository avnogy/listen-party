package main

import "net/http"

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	requireAdmin := s.Auth.Require(RoleAdmin)
	mux.Handle("GET /admin", requireAdmin(http.HandlerFunc(s.handleAdminPage)))
	mux.Handle("GET /admin.js", requireAdmin(http.HandlerFunc(s.handleAdminJS)))
	requireUser := s.Auth.Require()
	webFiles := http.FileServer(http.FS(webRoot()))
	adminFiles := requireAdmin(http.FileServer(http.FS(adminRoot())))
	mux.Handle("GET /admin/", adminFiles)
	mux.Handle("GET /{$}", requireUser(http.HandlerFunc(s.handleApp)))
	mux.Handle("GET /favicon.ico", http.HandlerFunc(s.handleFavicon))
	mux.Handle("GET /rooms/{room}", requireUser(http.HandlerFunc(s.handleApp)))
	mux.Handle("GET /assets/", requireUser(http.StripPrefix("/assets/", webFiles)))
	mux.Handle("GET /rooms/{room}/events", requireUser(http.HandlerFunc(s.handleEvents)))
	mux.Handle("GET /api/session", requireUser(http.HandlerFunc(s.handleSession)))
	mux.Handle("GET /rooms/{room}/api/state", requireUser(http.HandlerFunc(s.handleState)))
	mux.Handle("GET /rooms/{room}/api/admin", requireUser(http.HandlerFunc(s.handleRoomAdmin)))
	mux.Handle("PUT /rooms/{room}/api/admin", requireUser(http.HandlerFunc(s.handleRoomAdminUpdate)))
	mux.Handle("POST /rooms/{room}/api/admin/disconnect", requireUser(http.HandlerFunc(s.handleRoomAdminDisconnect)))
	mux.Handle("GET /api/search", requireUser(http.HandlerFunc(s.handleSearch)))
	mux.Handle("GET /api/library", requireUser(http.HandlerFunc(s.handleLibrary)))
	mux.Handle("GET /api/playlists", requireUser(http.HandlerFunc(s.handlePlaylists)))
	mux.Handle("POST /api/playlists", requireUser(http.HandlerFunc(s.handlePlaylistCreate)))
	mux.Handle("GET /api/playlists/{id}", requireUser(http.HandlerFunc(s.handlePlaylist)))
	mux.Handle("DELETE /api/playlists/{id}", requireUser(http.HandlerFunc(s.handlePlaylistDelete)))
	mux.Handle("POST /api/playlists/{id}/items", requireUser(http.HandlerFunc(s.handlePlaylistAddItem)))
	mux.Handle("POST /api/playlists/{id}/import-folder", requireUser(http.HandlerFunc(s.handlePlaylistImportFolder)))
	mux.Handle("DELETE /api/playlists/{id}/items/{item}", requireUser(http.HandlerFunc(s.handlePlaylistRemoveItem)))
	mux.Handle("POST /rooms/{room}/api/command", requireUser(http.HandlerFunc(s.handleCommand)))
	mux.Handle("POST /api/admin/rescan", requireAdmin(http.HandlerFunc(s.handleRescan)))
	mux.Handle("POST /api/admin/rescan-dir", requireAdmin(http.HandlerFunc(s.handleRescanDir)))
	mux.Handle("GET /api/admin/config", requireAdmin(http.HandlerFunc(s.handleConfig)))
	mux.Handle("PUT /api/admin/config", requireAdmin(http.HandlerFunc(s.handleConfigUpdate)))
	mux.Handle("GET /media/{id}/artwork", requireUser(http.HandlerFunc(s.handleArtwork)))
	mux.Handle("GET /media/{id}", requireUser(http.HandlerFunc(s.handleMedia)))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	if s.AuthRoutes == nil {
		return s.rejectBannedIPs(mux)
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isAuthRoute(r.URL.Path) {
			s.AuthRoutes.ServeHTTP(w, r)
			return
		}
		mux.ServeHTTP(w, r)
	})
	return s.rejectBannedIPs(handler)
}
