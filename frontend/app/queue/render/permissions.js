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

export function refreshPermissionControls(store) {
  document.querySelectorAll("[data-room-action]").forEach((button) => {
    button.hidden = !canRunCommand(button.dataset.roomAction, store);
  });
  document.querySelectorAll(".item .row-actions").forEach(updateRowActionLayout);
  updatePlaylistActionButtons(store);
}

export function updateRowActionLayout(actions) {
  const visibleRoomActions = [...actions.querySelectorAll("[data-room-action]")].filter((btn) => !btn.hidden);
  const hasRoomActions = visibleRoomActions.length > 0;
  const hasPlaylistAction = Boolean(actions.querySelector(".playlist-more-button"));
  const hasStandaloneAction = [...actions.children].some((el) => el.matches("button:not([data-room-action])") && !el.hidden);
  actions.classList.toggle("playlist-only", !hasRoomActions && hasPlaylistAction);
  actions.classList.toggle("no-actions", !hasRoomActions && !hasPlaylistAction && !hasStandaloneAction);
  actions.classList.toggle("single-room-action", visibleRoomActions.length === 1);
  actions.classList.toggle("has-standalone-action", hasStandaloneAction);
  actions.classList.toggle("standalone-only", !hasRoomActions && !hasPlaylistAction && hasStandaloneAction);
}

export function updatePlaylistActionButtons(store) {
  // Implemented in playlistMenu.js
}