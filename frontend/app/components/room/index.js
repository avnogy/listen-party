// Room component - room settings, library status, rail mode
import { api } from "../../../core/api/client.js";
import { roomAPI } from "../../../core/api/endpoints.js";
import { loadLibraryStatus as rawLoadLibrary, setRailMode as rawSetRailMode, closeRoomSettings as rawCloseRoomSettings, toggleRoomSettings as rawToggleRoomSettings, renderRoomSettings, readRoomSettingsGrants, loadRoomSettings } from "../../room/component.js";

export function createRoomComponent(store, { playlistsComponent } = {}) {
  const ui = {
    libraryStatus: document.getElementById("libraryStatus"),
    roomSelect: document.getElementById("roomSelect"),
    roomSettingsButton: document.getElementById("roomSettingsButton"),
    roomSettingsView: document.getElementById("roomSettingsView"),
    closeRoomSettingsButton: document.getElementById("closeRoomSettings"),
    roomSettingsGrants: document.getElementById("roomSettingsGrants"),
    roomSettingsStatus: document.getElementById("roomSettingsStatus"),
    saveRoomSettingsButton: document.getElementById("saveRoomSettings"),
    libraryPanel: document.getElementById("libraryPanel"),
    libraryTab: document.getElementById("libraryTab"),
    playlistsTab: document.getElementById("playlistsTab"),
    libraryViews: document.querySelectorAll(".library-view"),
    playlistsView: document.getElementById("playlistsView"),
  };

  function loadLibraryStatus() {
    return rawLoadLibrary(api, ui.libraryStatus);
  }

  function setRailMode(mode, opts) {
    rawSetRailMode(mode, ui, store, { ...opts, loadPlaylistsFn: playlistsComponent?.loadPlaylists });
  }

  function closeRoomSettings() {
    rawCloseRoomSettings(ui);
  }

  function toggleRoomSettings() {
    rawToggleRoomSettings(ui, store, { api, roomAPI });
  }

  function loadAndRenderRoomSettings() {
    return loadRoomSettings(api, roomAPI, store.getState().currentRoomId, ui.roomSettingsGrants, ui.roomSettingsStatus).catch((err) => {
      if (ui.roomSettingsStatus) ui.roomSettingsStatus.textContent = err.message || "Could not load room settings";
    });
  }

  function saveRoomSettings() {
    const state = store.getState();
    clearTimeout(state.roomSaveFeedbackTimer);

    if (ui.saveRoomSettingsButton) {
      ui.saveRoomSettingsButton.disabled = true;
      ui.saveRoomSettingsButton.textContent = "Saving...";
    }
    if (ui.roomSettingsStatus) ui.roomSettingsStatus.textContent = "Saving...";

    const grants = readRoomSettingsGrants(ui.roomSettingsGrants);
    api(roomAPI(state.currentRoomId, "/api/admin/grants"), {
      method: "PUT",
      body: JSON.stringify({ grants }),
    }).then((settings) => {
      if (ui.saveRoomSettingsButton) ui.saveRoomSettingsButton.textContent = "Saved";
      if (ui.roomSettingsStatus) {
        ui.roomSettingsStatus.textContent = "Saved";
        ui.roomSettingsStatus.title = "";
      }
      renderRoomSettings(settings.grants || {}, ui.roomSettingsGrants);
      return api(roomAPI(state.currentRoomId, "/api/state"));
    }).catch((err) => {
      if (ui.saveRoomSettingsButton) ui.saveRoomSettingsButton.textContent = "Failed";
      if (ui.roomSettingsStatus) {
        ui.roomSettingsStatus.textContent = "Failed";
        ui.roomSettingsStatus.title = err.message || "Save failed";
      }
    }).finally(() => {
      store.setState({
        roomSaveFeedbackTimer: setTimeout(() => {
          if (ui.saveRoomSettingsButton) {
            ui.saveRoomSettingsButton.disabled = false;
            ui.saveRoomSettingsButton.textContent = "Save";
          }
          if (ui.roomSettingsStatus) {
            ui.roomSettingsStatus.textContent = "";
            ui.roomSettingsStatus.title = "";
          }
        }, 1400),
      });
    });
  }

  return {
    start() {
      if (ui.roomSettingsButton) {
        ui.roomSettingsButton.addEventListener("click", () => toggleRoomSettings());
      }

      if (ui.closeRoomSettingsButton) {
        ui.closeRoomSettingsButton.addEventListener("click", () => closeRoomSettings());
      }

      if (ui.saveRoomSettingsButton) {
        ui.saveRoomSettingsButton.addEventListener("click", () => saveRoomSettings());
      }

      if (ui.libraryTab) {
        ui.libraryTab.addEventListener("click", () => setRailMode("library"));
      }

      if (ui.playlistsTab) {
        ui.playlistsTab.addEventListener("click", () => setRailMode("playlists"));
      }

      loadLibraryStatus().catch(console.error);
    },

    render(state) {
      if (ui.roomSettingsButton) ui.roomSettingsButton.hidden = !store.getState().canAdministerCurrentRoom;
    },

    teardown() {
      closeRoomSettings();
    },

    // Public API for other components
    loadLibraryStatus,
    setRailMode,
    closeRoomSettings,
    toggleRoomSettings,
    loadAndRenderRoomSettings,
    saveRoomSettings,
  };
}
