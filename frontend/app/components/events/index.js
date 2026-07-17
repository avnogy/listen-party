// Events component - SSE connection, history, presence, queue changes, auto-DJ
import { api } from "../../../core/api/client.js";
import { roomAPI } from "../../../core/api/endpoints.js";
import { closeEvents as rawCloseEvents, connectEvents as rawConnectEvents } from "../../core/events.js";
import { renderHistory as rawRenderHistory } from "../../queue/render/history.js";
import { renderPresence as rawRenderPresence } from "../../queue/render/presence.js";
import { renderQueueChanges as rawRenderQueueChanges } from "../../queue/render/queueChanges.js";
import { closeAutoDJSourceMenu as rawCloseAutoDJ, renderAutoDJSourceMenu as rawRenderAutoDJ } from "../../queue/render/autoDJ.js";
import { emptyHint } from "../../queue/render/emptyHint.js";

export function createEventsComponent(store) {
  const ui = {
    historyEl: document.getElementById("history"),
    clearHistoryButton: document.getElementById("clearHistory"),
    listenerListEl: document.getElementById("listenerList"),
    presenceEl: document.getElementById("presence"),
    queueChangesButton: document.getElementById("queueChangesButton"),
    queueChangesListEl: document.getElementById("queueChangesList"),
    autoDJButton: document.getElementById("autoDJ"),
    autoDJSourceButton: document.getElementById("autoDJSource"),
    autoDJSourceMenu: document.getElementById("autoDJSourceMenu"),
  };

  function closeEvents() {
    rawCloseEvents();
  }

  function connectEvents() {
    rawConnectEvents();
  }

  return {
    start() {
      window.addEventListener("pagehide", closeEvents);
    },

    teardown() {
      closeEvents();
      window.removeEventListener("pagehide", closeEvents);
    },

    render(state) {
      const canManageQueue = store.getState().currentPermissions.has("queue_manage");
      const autoDJ = state.auto_dj || { enabled: false, source: { type: "library", name: "Entire Library" } };

      if (ui.autoDJButton) {
        ui.autoDJButton.disabled = !canManageQueue;
        ui.autoDJButton.dataset.enabled = String(Boolean(autoDJ.enabled));
        ui.autoDJButton.setAttribute("aria-pressed", String(Boolean(autoDJ.enabled)));
        ui.autoDJButton.title = autoDJ.enabled ? "Disable Auto-DJ" : "Enable Auto-DJ";
        ui.autoDJButton.setAttribute("aria-label", ui.autoDJButton.title);
      }
      if (ui.autoDJSourceButton) ui.autoDJSourceButton.disabled = !canManageQueue;
      if (!canManageQueue) rawCloseAutoDJ(ui.autoDJSourceMenu, ui.autoDJSourceButton);

      if (ui.autoDJSourceButton) ui.autoDJSourceButton.textContent = autoDJ.source?.name || "Entire Library";
      if (ui.autoDJSourceButton) ui.autoDJSourceButton.title = `Auto-DJ source: ${ui.autoDJSourceButton.textContent}`;

      const history = state.history || [];
      if (ui.historyEl) rawRenderHistory(history, ui.historyEl, {}, emptyHint);
      if (ui.clearHistoryButton) ui.clearHistoryButton.hidden = !canManageQueue || history.length === 0;

      if (ui.listenerListEl && ui.presenceEl) {
        rawRenderPresence(state, ui.listenerListEl, ui.presenceEl, store, api, (path) => `/rooms/${encodeURIComponent(store.getState().currentRoomId)}${path}`);
      }

      if (ui.queueChangesButton && ui.queueChangesListEl) {
        rawRenderQueueChanges(state.actions || [], ui.queueChangesButton, ui.queueChangesListEl);
      }
    },

    onGenerationChange() {
      if (ui.autoDJSourceMenu && ui.autoDJSourceButton) {
        rawCloseAutoDJ(ui.autoDJSourceMenu, ui.autoDJSourceButton);
      }
    },

    // Public API for other components
    closeEvents,
    connectEvents,

    closeAutoDJSourceMenu() {
      if (ui.autoDJSourceMenu && ui.autoDJSourceButton) {
        rawCloseAutoDJ(ui.autoDJSourceMenu, ui.autoDJSourceButton);
      }
    },

    renderAutoDJSourceMenu(availablePlaylists, command) {
      if (ui.autoDJSourceMenu && ui.autoDJSourceButton) {
        rawRenderAutoDJ(availablePlaylists, ui.autoDJSourceMenu, ui.autoDJSourceButton, store, command);
      }
    },
  };
}
