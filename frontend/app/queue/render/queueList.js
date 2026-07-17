// Queue item rendering (used by queue component)
import { trackMeta, trackTitle, trackSubtitle, playbackRequester, trackActionGroup, standardTrackCommands, trashButton } from "./index.js";

export function renderQueueItem(item, store, command, trackRow, standardTrackCommands, trashButton, trackActionGroup, trackMeta, trackTitle, trackSubtitle, playbackRequester, queueDragHandle) {
  const li = document.createElement("li");
  li.className = "item queue-item";
  li.dataset.queueItemId = String(item.id);
  const track = item.track;
  const meta = trackMeta(
    track ? trackTitle(track) : "Unavailable track",
    track ? trackSubtitle(track, true) : "",
    playbackRequester(item)
  );
  const remove = trashButton("Remove from queue", async () => {
    await command({ action: "queue_remove", queue_item_id: item.id });
  });
  remove.dataset.roomAction = "queue_remove";
  remove.hidden = !canRunCommand("queue_remove", store);
  const actions = trackActionGroup([], item.dedupe_key, [remove]);
  if (hasRoomPermission("queue_manage", store)) {
    li.classList.add("queue-item-draggable");
    li.append(queueDragHandle(item), meta, actions);
  } else {
    li.append(meta, actions);
  }
  return li;
}

function hasRoomPermission(permission, store) {
  return store.getState().currentPermissions.has(permission);
}

function canRunCommand(action, store) {
  if (["play", "play_now", "pause", "previous", "seek", "skip"].includes(action)) {
    return hasRoomPermission("playback_control", store);
  }
  if (action === "queue_add") return hasRoomPermission("queue_add", store);
  return hasRoomPermission("queue_manage", store);
}