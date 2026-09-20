package main

import domainrooms "listen-party/backend/rooms"

type RoomPermission = domainrooms.RoomPermission
type Room = domainrooms.Room
type RoomManager = domainrooms.RoomManager

const (
	PermissionQueueAdd        = domainrooms.PermissionQueueAdd
	PermissionQueueManage     = domainrooms.PermissionQueueManage
	PermissionPlaybackControl = domainrooms.PermissionPlaybackControl
	PermissionVolumeControl   = domainrooms.PermissionVolumeControl
	EveryoneRoomGrant         = domainrooms.EveryoneRoomGrant
)

var roomPermissions = []RoomPermission{
	PermissionQueueAdd,
	PermissionQueueManage,
	PermissionPlaybackControl,
	PermissionVolumeControl,
}

func NewRoomManager(configs []Room) *RoomManager { return domainrooms.NewRoomManager(configs) }

func UserHasRoomPermission(user UserInfo, room Room, permission RoomPermission) bool {
	return domainrooms.UserHasRoomPermission(user, room, permission)
}

func UserIsRoomAdmin(user UserInfo, room Room) bool {
	return domainrooms.UserIsRoomAdmin(user, room)
}

func RoomPermissionsForUser(user UserInfo, room Room) []RoomPermission {
	return domainrooms.RoomPermissionsForUser(user, room)
}

func openRoomGrants() map[string][]RoomPermission { return domainrooms.OpenRoomGrants() }

func cloneRoomGrants(grants map[string][]RoomPermission) map[string][]RoomPermission {
	return domainrooms.CloneRoomGrants(grants)
}
