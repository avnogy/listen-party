package playlists

import (
	"net/http"

	"listen-party/backend/app/media"
	"listen-party/backend/auth"
	appauth "listen-party/backend/auth"
	httpapi "listen-party/backend/http"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/rooms"
)

const maxFolderImportFiles = 50_000

type Host interface {
	AuthStore() auth.Gate
	LibraryStore() *musiclib.Library
	RoomStore() *rooms.RoomManager
}

type playlistView struct {
	musiclib.Playlist
	CanEdit bool `json:"can_edit"`
}

func HandlePlaylists(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	playlists, err := host.LibraryStore().ListPlaylists(r.Context())
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	out := make([]playlistView, 0, len(playlists))
	for _, playlist := range playlists {
		out = append(out, playlistViewForUser(user, playlist))
	}
	httpapi.WriteJSON(w, out)
}

func HandlePlaylist(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := media.PathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, playlistViewForUser(user, playlist))
}

func HandlePlaylistCreate(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if !httpapi.ReadJSON(w, r, &req) {
		return
	}
	playlist, err := host.LibraryStore().CreatePlaylist(r.Context(), req.Name, user.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	httpapi.WriteJSON(w, playlistViewForUser(user, playlist))
}

func HandlePlaylistAddItem(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := media.PathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	var req struct {
		DedupeKey string `json:"dedupe_key"`
	}
	if !httpapi.ReadJSON(w, r, &req) {
		return
	}
	if req.DedupeKey == "" {
		http.Error(w, "dedupe_key is required", http.StatusBadRequest)
		return
	}
	if _, err := host.LibraryStore().AddPlaylistTrack(r.Context(), id, req.DedupeKey); err != nil {
		httpapi.WriteError(w, err)
		return
	}
	playlist, err = host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, playlistViewForUser(user, playlist))
}

func HandlePlaylistRemoveItem(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := media.PathID(w, r, "id")
	if !ok {
		return
	}
	itemID, ok := media.PathID(w, r, "item")
	if !ok {
		return
	}
	playlist, err := host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	if err := host.LibraryStore().RemovePlaylistItem(r.Context(), id, itemID); err != nil {
		httpapi.WriteError(w, err)
		return
	}
	host.RoomStore().InvalidateAutoDJPlaylistCandidate(id)
	playlist, err = host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	httpapi.WriteJSON(w, playlistViewForUser(user, playlist))
}

func HandlePlaylistImportFolder(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := media.PathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
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
	if !httpapi.ReadJSON(w, r, &req) {
		return
	}
	if len(req.Files) > maxFolderImportFiles {
		http.Error(w, "folder contains too many files", http.StatusRequestEntityTooLarge)
		return
	}
	result, err := host.LibraryStore().ImportPlaylistFolder(r.Context(), id, req.Files)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	httpapi.WriteJSON(w, result)
}

func HandlePlaylistDelete(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	id, ok := media.PathID(w, r, "id")
	if !ok {
		return
	}
	playlist, err := host.LibraryStore().GetPlaylist(r.Context(), id)
	if err != nil {
		httpapi.WriteError(w, err)
		return
	}
	if !userCanEditPlaylist(user, playlist) {
		http.Error(w, "playlist edit denied", http.StatusForbidden)
		return
	}
	if err := host.LibraryStore().DeletePlaylist(r.Context(), id); err != nil {
		httpapi.WriteError(w, err)
		return
	}
	host.RoomStore().ResetAutoDJPlaylistSource(id)
	w.WriteHeader(http.StatusNoContent)
}

func playlistViewForUser(user appauth.UserInfo, playlist musiclib.Playlist) playlistView {
	return playlistView{
		Playlist: playlist,
		CanEdit:  userCanEditPlaylist(user, playlist),
	}
}

func userCanEditPlaylist(user appauth.UserInfo, playlist musiclib.Playlist) bool {
	return user.Role == appauth.RoleAdmin || playlist.OwnerID == user.ID
}
