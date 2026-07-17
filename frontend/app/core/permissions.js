// Permission helpers
export function hasRoomPermission(permission, store) {
  return store.getState().currentPermissions.has(permission);
}

export function canRunCommand(action, store) {
  if (["play", "play_now", "pause", "previous", "seek", "skip"].includes(action)) {
    return hasRoomPermission("playback_control", store);
  }
  if (action === "queue_add") return hasRoomPermission("queue_add", store);
  return hasRoomPermission("queue_manage", store);
}