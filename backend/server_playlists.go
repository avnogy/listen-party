package main

import (
	"net/http"

	musiclib "listen-party/backend/internal/library"
)

type playlistView struct {
	musiclib.Playlist
	CanEdit bool `json:"can_edit"`
}

func (s *Server) handlePlaylists(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	playlists, err := s.Library.ListPlaylists(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]playlistView, 0, len(playlists))
	for _, playlist := range playlists {
		out = append(out, s.playlistView(user, playlist))
	}
	writeJSON(w, out)
}

func (s *Server) handlePlaylist(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, s.playlistView(user, playlist))
}

func (s *Server) handlePlaylistCreate(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	playlist, err := s.Library.CreatePlaylist(r.Context(), req.Name, user.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, s.playlistView(user, playlist))
}

func (s *Server) handlePlaylistAddItem(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	var req struct {
		DedupeKey string `json:"dedupe_key"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.DedupeKey == "" {
		http.Error(w, "dedupe_key is required", http.StatusBadRequest)
		return
	}
	if _, err := s.Library.AddPlaylistTrack(r.Context(), id, req.DedupeKey); err != nil {
		writeError(w, err)
		return
	}
	playlist, err = s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, s.playlistView(user, playlist))
}

func (s *Server) handlePlaylistRemoveItem(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	itemID, ok := pathID(w, r, "item")
	if !ok {
		return
	}
	playlist, err := s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	if err := s.Library.RemovePlaylistItem(r.Context(), id, itemID); err != nil {
		writeError(w, err)
		return
	}
	s.Rooms.InvalidateAutoDJPlaylistCandidate(id)
	playlist, err = s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, s.playlistView(user, playlist))
}

func (s *Server) handlePlaylistImportFolder(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	var req struct {
		Files []musiclib.FolderManifestFile `json:"files"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<20)
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.Files) > maxFolderImportFiles {
		http.Error(w, "folder contains too many files", http.StatusRequestEntityTooLarge)
		return
	}
	result, err := s.Library.ImportPlaylistFolder(r.Context(), id, req.Files)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, result)
}

func (s *Server) handlePlaylistDelete(w http.ResponseWriter, r *http.Request) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := s.Library.GetPlaylist(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	if err := s.Library.DeletePlaylist(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	s.Rooms.ResetAutoDJPlaylistSource(id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) playlistView(user UserInfo, playlist musiclib.Playlist) playlistView {
	return playlistView{
		Playlist: playlist,
		CanEdit:  userCanEditPlaylist(user, playlist),
	}
}

func userCanEditPlaylist(user UserInfo, playlist musiclib.Playlist) bool {
	return user.Role == RoleAdmin || playlist.OwnerID == user.ID
}
