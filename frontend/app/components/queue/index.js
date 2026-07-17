// Queue component - queue list, Sortable drag-drop, command execution, permissions
import { api } from "../../../core/api/client.js";
import { roomAPI } from "../../../core/api/endpoints.js";
import { renderQueueItem as rawRenderQueueItem } from "../../queue/render/queueList.js";
import { refreshPermissionControls as rawRefreshPermissions } from "../../queue/render/permissions.js";
import { trackRow, standardTrackCommands, trackTitle, trackSubtitle, playbackRequester, trackMeta, trackActionGroup, commandButton, commandIcon, trashButton } from "../../queue/render/index.js";
import { hasRoomPermission as rawHasPermission, canRunCommand as rawCanRunCommand } from "../../core/permissions.js";
import { emptyHint } from "../../queue/render/emptyHint.js";

export function createQueueComponent(store, { renderState }) {
  const ui = {
    queueEl: document.getElementById("queue"),
    clearQueueButton: document.getElementById("clearQueue"),
    clearHistoryButton: document.getElementById("clearHistory"),
  };

  function hasRoomPermission(permission) {
    return rawHasPermission(permission, store);
  }

  function canRunCommand(action) {
    return rawCanRunCommand(action, store);
  }

  async function command(body) {
    const state = store.getState();
    const newState = await api(roomAPI(state.currentRoomId, "/api/command"), {
      method: "POST",
      body: JSON.stringify(body),
    });
    renderState(newState);
  }

  async function submitQueueReorder(queueItemId, beforeQueueItemId) {
    const state = store.getState();
    if (state.queueReorderPending || !hasRoomPermission("queue_manage")) return;

    store.setState({ queueReorderPending: true });

    try {
      const newState = await api(roomAPI(state.currentRoomId, "/api/command"), {
        method: "POST",
        body: JSON.stringify({ action: "queue_reorder", queue_item_id: queueItemId, before_queue_item_id: beforeQueueItemId }),
      });
      store.setState({ queueReorderPending: false });
      renderState(newState);
      applyPendingQueueState();
    } catch (err) {
      console.error(err);
      store.setState({ queueReorderPending: false, pendingQueueState: null });
      try {
        renderState(await api(roomAPI(state.currentRoomId, "/api/state")));
      } catch (refreshErr) {
        console.error(refreshErr);
      }
      if (ui.queueEl) {
        ui.queueEl.classList.add("queue-reorder-error");
        setTimeout(() => ui.queueEl.classList.remove("queue-reorder-error"), 500);
      }
    }
  }

  function applyPendingQueueState() {
    const state = store.getState().pendingQueueState;
    store.setState({ pendingQueueState: null });
    if (state) renderState(state);
  }

  function renderQueueItem(item) {
    return rawRenderQueueItem(item, store, command, trackRow, standardTrackCommands, trashButton, trackActionGroup, trackMeta, trackTitle, trackSubtitle, playbackRequester, (item) => {
      const handle = document.createElement("span");
      handle.className = "queue-drag-handle";
      handle.textContent = "\u2630";
      return handle;
    });
  }

  function refreshPermissionControls() {
    rawRefreshPermissions(store);
  }

  let sortable = null;

  function initSortable() {
    if (sortable) sortable.destroy();
    if (typeof Sortable === "undefined") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sortable = Sortable.create(ui.queueEl, {
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
        store.setState({ queueDragActive: true, pendingQueueState: null });
        ui.queueEl.classList.add("queue-dragging");
      },
      onEnd(event) {
        store.setState({ queueDragActive: false });
        ui.queueEl.classList.remove("queue-dragging");
        if (event.oldDraggableIndex === event.newDraggableIndex) return;
        const queueItemId = Number(event.item.dataset.queueItemId);
        const before = event.item.nextElementSibling;
        const beforeQueueItemId = before ? Number(before.dataset.queueItemId) : 0;
        submitQueueReorder(queueItemId, beforeQueueItemId);
      },
    });
  }

  function updateSortable() {
    if (sortable) sortable.option("disabled", store.getState().queueDragActive || store.getState().queueReorderPending);
  }

  return {
    start() {
      window.__queueCommand = command;
      window.__canRunCommand = canRunCommand;
      window.__hasRoomPermission = hasRoomPermission;
      initSortable();
    },

    teardown() {
      if (sortable) {
        sortable.destroy();
        sortable = null;
      }
    },

    render(state) {
      const queue = state.queue || [];
      const canManageQueue = hasRoomPermission("queue_manage");

      if (ui.queueEl) {
        ui.queueEl.replaceChildren(...(queue.length ? queue.map(renderQueueItem) : [emptyHint("Queue is empty", "li")]));
      }

      if (ui.clearQueueButton) ui.clearQueueButton.hidden = !canManageQueue || queue.length === 0;

      refreshPermissionControls();
      updateSortable();
    },

    onGenerationChange() {
      // Queue is reset on generation change, no special handling needed
    },

    // Public API for other components
    command,
    renderQueueItem,
    refreshPermissionControls,
    hasRoomPermission,
    canRunCommand,
    updateSortable,
  };
}
