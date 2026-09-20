package rooms

import (
	"slices"

	appauth "listen-party/backend/auth"
)

func UserHasRoomPermission(user appauth.UserInfo, room Room, permission RoomPermission) bool {
	if overrides, ok := room.UserOverrides[user.ID]; ok {
		return slices.Contains(overrides, permission)
	}
	if UserIsRoomAdmin(user, room) {
		return true
	}
	if (user.ID != "" || user.Username != "") && slices.Contains(room.Grants[EveryoneRoomGrant], permission) {
		return true
	}
	for _, group := range user.Groups {
		if slices.Contains(room.Grants[group], permission) {
			return true
		}
	}
	return false
}

func UserIsRoomAdmin(user appauth.UserInfo, room Room) bool {
	if user.Role == appauth.RoleAdmin {
		return true
	}
	for _, group := range user.Groups {
		if slices.Contains(room.AdminGroups, group) {
			return true
		}
	}
	return false
}

func OpenRoomGrants() map[string][]RoomPermission {
	return map[string][]RoomPermission{
		EveryoneRoomGrant: append([]RoomPermission(nil), roomPermissions...),
	}
}

func RoomPermissionsForUser(user appauth.UserInfo, room Room) []RoomPermission {
	permissions := make([]RoomPermission, 0, len(roomPermissions))
	for _, permission := range roomPermissions {
		if UserHasRoomPermission(user, room, permission) {
			permissions = append(permissions, permission)
		}
	}
	return permissions
}

func CloneRoomGrants(grants map[string][]RoomPermission) map[string][]RoomPermission {
	if len(grants) == 0 {
		return nil
	}
	clone := make(map[string][]RoomPermission, len(grants))
	for group, permissions := range grants {
		clone[group] = make([]RoomPermission, len(permissions))
		copy(clone[group], permissions)
	}
	return clone
}
