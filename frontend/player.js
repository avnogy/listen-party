import {appState, ui, config} from "./main-context.js";
import {api} from "./api-module.js";
import {hasRoomPermission} from "./queue.js";
import {hasMedia, mediaDuration, playbackPosition, renderVolumeButton, roomAPI, setSeekUI, syncCurrentAudio} from "./core.js";
import {renderState} from "./state-render.js";
const {syncToleranceSeconds} = config;
const { audio, queue: queueEl } = ui;
// Player controls, audio synchronization, and queue drag/drop setup.

function initQueueSortable() {
  if (typeof Sortable === "undefined") {
    throw new Error("embedded SortableJS asset did not load");
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  appState.queueSortable = Sortable.create(queueEl, {
    animation: reduceMotion ? 0 : 160,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    handle: ".queue-drag-handle",
    draggable: ".queue-item",
    dataIdAttr: "data-queue-item-id",
    ghostClass: "queue-sortable-ghost",
    chosenClass: "queue-sortable-chosen",
    dragClass: "queue-sortable-drag",
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    delay: 120,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    onStart() {
      appState.queueDragActive = true;
      appState.pendingQueueState = null;
      queueEl.classList.add("queue-dragging");
    },
    onEnd(event) {
      appState.queueDragActive = false;
      queueEl.classList.remove("queue-dragging");
      if (event.oldDraggableIndex === event.newDraggableIndex) {
        applyPendingQueueState();
        return;
      }
      const queueItemID = Number(event.item.dataset.queueItemId);
      const before = event.item.nextElementSibling;
      const beforeQueueItemID = before ? Number(before.dataset.queueItemId) : 0;
      submitQueueReorder(queueItemID, beforeQueueItemID);
    },
  });
  updateQueueSortable();
}

function updateQueueSortable() {
  if (!appState.queueSortable) return;
  const enabled = hasRoomPermission("queue_manage") && !appState.queueReorderPending;
  appState.queueSortable.option("disabled", !enabled);
  queueEl.classList.toggle("queue-sortable-enabled", enabled);
}

function applyPendingQueueState() {
  const state = appState.pendingQueueState;
  appState.pendingQueueState = null;
  if (state) renderState(state);
}

async function submitQueueReorder(queueItemID, beforeQueueItemID) {
  if (appState.queueReorderPending || !hasRoomPermission("queue_manage")) return;
  appState.queueReorderPending = true;
  updateQueueSortable();
  try {
    const state = await api(roomAPI("/api/command"), {
      method: "POST",
      body: JSON.stringify({
        action: "queue_reorder",
        queue_item_id: queueItemID,
        before_queue_item_id: beforeQueueItemID,
      }),
    });
    appState.queueReorderPending = false;
    renderState(state);
    applyPendingQueueState();
  } catch (err) {
    console.error(err);
    appState.queueReorderPending = false;
    appState.pendingQueueState = null;
    try {
      renderState(await api(roomAPI("/api/state")));
    } catch (refreshErr) {
      console.error(refreshErr);
    }
    queueEl.classList.add("queue-reorder-error");
    setTimeout(() => queueEl.classList.remove("queue-reorder-error"), 500);
  } finally {
    updateQueueSortable();
  }
}

async function command(body) {
  const state = await api(roomAPI("/api/command"), {
    method: "POST",
    body: JSON.stringify(body),
  });
  renderState(state);
}

function setSyncedTime(target) {
  if (!Number.isFinite(target)) return;
  if (audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
  if (Math.abs(audio.currentTime - target) > syncToleranceSeconds) {
    try {
      audio.currentTime = target;
    } catch (err) {
      console.warn("could not seek synchronized media yet", err);
    }
  }
}

function playAudio() {
  if (!hasMedia()) {
    return;
  }
  audio.play().catch((err) => {
    console.warn("browser refused synchronized playback", err);
  });
}

function syncAudio(state, correctTime = true) {
  if (!state.started_at) {
    setSeekUI(0);
    return;
  }
  const target = playbackPosition(state);
  const duration = mediaDuration();
  if (!state.paused && duration > 0 && target > duration) {
    setSeekUI(duration);
    return;
  }
  if (state.paused) {
    setSeekUI(target);
    if (correctTime) setSyncedTime(target);
    if (!audio.paused) {
      audio.pause();
    }
    return;
  }

  if (correctTime) setSyncedTime(target);
  if (audio.paused) playAudio();
  setSeekUI(audio.readyState >= HTMLMediaElement.HAVE_METADATA ? audio.currentTime : target);
}

export {initQueueSortable, updateQueueSortable, applyPendingQueueState, submitQueueReorder, command, setSyncedTime, playAudio, syncAudio};

for (const eventName of ["loadedmetadata", "canplay"]) {
  audio.addEventListener(eventName, syncCurrentAudio);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncCurrentAudio();
});

audio.addEventListener("timeupdate", () => {
  if (!appState.seeking && hasMedia()) {
    setSeekUI(audio.currentTime);
  }
});

audio.addEventListener("volumechange", renderVolumeButton);
