import { storageGet, storageSet } from "../../core/store/persistence.js";

export const CONFIG = {
  defaultVolume: 0.25,
  syncToleranceSeconds: 0.3,
  searchDebounceMS: 300,
  searchTextStorageKey: "listen-party.searchText",
  searchFieldStorageKey: "listen-party.searchField",
  railModeStorageKey: "listen-party.railMode",
  playlistStorageKey: "listen-party.selectedPlaylist",
  localVolumeStorageKey: "listen-party.localVolume",
  localMutedStorageKey: "listen-party.localMuted",
  minimumRoomSaveFeedbackMS: 450,
  roomSaveResultVisibleMS: 1400,
  recoveryStorageKey: "listen-party.playbackRecoveryAt",
  recoveryCooldownMS: 30000,
};

export function persistState(key, value) {
  storageSet(key, value);
}

export function getPersisted(key, fallback = "") {
  return storageGet(key, fallback);
}

export function restoreSearchPreferences(ui) {
  if (!ui.searchInput || !ui.searchField) return;
  ui.searchInput.value = getPersisted(CONFIG.searchTextStorageKey);
  const field = getPersisted(CONFIG.searchFieldStorageKey);
  if ([...ui.searchField.options].some((opt) => opt.value === field)) {
    ui.searchField.value = field;
  }
}

export function restoreRailPreferences(ui, store) {
  const storedPlaylistId = Number(getPersisted(CONFIG.playlistStorageKey));
  const selectedPlaylistId = Number.isInteger(storedPlaylistId) && storedPlaylistId > 0 ? storedPlaylistId : 0;
  const mode = getPersisted(CONFIG.railModeStorageKey) === "playlists" ? "playlists" : "library";

  store.setState({ selectedPlaylistId, railMode: mode });
  if (ui.libraryTab && ui.playlistsTab) {
    ui.libraryTab.classList.toggle("active", mode === "library");
    ui.playlistsTab.classList.toggle("active", mode === "playlists");
  }
  if (ui.libraryViews) {
    ui.libraryViews.forEach((el) => (el.hidden = mode !== "library"));
  }
  if (ui.playlistsView) ui.playlistsView.hidden = mode !== "playlists";
}

export function restoreVolumePreferences(ui, store, audio) {
  const storedVolume = Number(getPersisted(CONFIG.localVolumeStorageKey));
  const localVolume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(Number(ui.volumeInput?.max) || 1, storedVolume)) : 0;
  const localMuted = getPersisted(CONFIG.localMutedStorageKey) === "true";
  const volumeMode = getPersisted(`listen-party.volumeMode.${store.getState().currentRoomId || "default"}`) === "room" ? "room" : "local";

  store.setState({ localVolume, localMuted, volumeMode });
}