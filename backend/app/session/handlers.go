package session

import (
	"net/http"

	assets "listen-party"
	"listen-party/backend/auth"
	httpapi "listen-party/backend/http"
	appauth "listen-party/backend/internal/auth"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/rooms"
)

type Host interface {
	AuthStore() auth.Gate
	RoomStore() *rooms.RoomManager
	RoomFromRequest(http.ResponseWriter, *http.Request) (*rooms.Room, appauth.UserInfo, bool)
}

func HandleApp(w http.ResponseWriter, r *http.Request, host Host) {
	if r.PathValue("room") != "" {
		if _, _, ok := host.RoomFromRequest(w, r); !ok {
			return
		}
	}
	http.ServeFileFS(w, r, assets.WebRoot(), "index.html")
}

func HandleSession(w http.ResponseWriter, r *http.Request, host Host) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		http.Error(w, "authentication required", http.StatusUnauthorized)
		return
	}
	roomList := host.RoomStore().List()
	type roomSummary struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	summaries := make([]roomSummary, 0, len(roomList))
	permissions := make(map[string][]rooms.RoomPermission, len(roomList))
	administration := make(map[string]bool, len(roomList))
	disconnected := make(map[string]bool, len(roomList))
	for _, room := range roomList {
		summaries = append(summaries, roomSummary{ID: room.ID, Name: room.Name})
		permissions[room.ID] = rooms.RoomPermissionsForUser(user, room)
		administration[room.ID] = rooms.UserIsRoomAdmin(user, room)
		if activeRoom, ok := host.RoomStore().Get(room.ID); ok {
			disconnected[room.ID] = activeRoom.Playback.ListenerDisconnected(user)
		}
	}
	httpapi.WriteJSON(w, map[string]any{
		"audio_extensions": musiclib.AudioExtensions(), "default_room_id": host.RoomStore().DefaultID(),
		"rooms": summaries, "permissions": permissions, "room_administration": administration,
		"disconnected": disconnected, "user": user,
	})
}

func HandleAdminPage(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, assets.AdminRoot(), "admin.html")
}
func HandleAdminJS(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, assets.AdminRoot(), "admin.js")
}
func HandleFavicon(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, assets.WebRoot(), "favicon.ico")
}
