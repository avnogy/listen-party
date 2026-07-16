import {dom, storageGet, storageSet} from "../shared/api-module.js";

const ids = {
  audio:"audio", track:"track", artist:"artist", queue:"queue", history:"history", results:"results",
  presence:"presence", presenceButton:"presenceButton", listenerList:"listenerList", clearQueue:"clearQueue",
  autoDJ:"autoDJ", autoDJSource:"autoDJSource", autoDJSourceMenu:"autoDJSourceMenu", clearHistory:"clearHistory",
  previous:"previous", skip:"skip", togglePlayback:"togglePlayback", artwork:"artwork", seek:"seek",
  elapsed:"elapsed", duration:"duration", mute:"mute", volume:"volume", volumeMode:"volumeMode",
  queueChangesButton:"queueChangesButton", queueChangesList:"queueChangesList", searchInput:"q", searchField:"searchField",
  libraryStatus:"libraryStatus", libraryTab:"libraryTab", playlistsTab:"playlistsTab", libraryPanel:"libraryPanel", playlistsView:"playlistsView",
  playlistSelect:"playlistSelect", deletePlaylistButton:"deletePlaylist", playlistDetailEl:"playlistDetail", newPlaylistButton:"newPlaylist",
  playlistCreatePanel:"playlistCreatePanel", playlistCreateForm:"playlistCreateForm", playlistNameInput:"playlistName", importPlaylistFolderButton:"importPlaylistFolder",
  playlistFolderInput:"playlistFolderInput", playlistImportStatus:"playlistImportStatus", roomSettingsView:"roomSettingsView", roomSettingsGrants:"roomSettingsGrants",
  roomSettingsStatus:"roomSettingsStatus", saveRoomSettingsButton:"saveRoomSettings", roomSettingsButton:"roomSettingsButton", closeRoomSettingsButton:"closeRoomSettings",
  currentUserEl:"currentUser", roomSelect:"roomSelect", logoutForm:"logoutForm",
};

export const ui = Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, dom.id(id)]));
export const libraryViews = dom.all(".library-view");
export const config = Object.freeze({
  defaultVolume:.25, syncToleranceSeconds:.3, searchDebounceMS:300,
  searchTextStorageKey:"listen-party.searchText", searchFieldStorageKey:"listen-party.searchField",
  railModeStorageKey:"listen-party.railMode", playlistStorageKey:"listen-party.selectedPlaylist",
  localVolumeStorageKey:"listen-party.localVolume", localMutedStorageKey:"listen-party.localMuted",
  minimumRoomSaveFeedbackMS:450, roomSaveResultVisibleMS:1400, recoveryStorageKey:"listen-party.playbackRecoveryAt", recoveryCooldownMS:30000,
});
export const appState = {
  lastState:null, lastStateReceivedAt:0, searchTimer:0, seeking:false, events:null,
  playlists:[], selectedPlaylistID:0, currentPermissions:new Set(), queueSortable:null,
  queueDragActive:false, queueReorderPending:false, pendingQueueState:null, canAdministerCurrentRoom:false,
  roomSaveFeedbackTimer:0, volumeMode:"local", localVolume:0, localMuted:false,
  currentRoomID:decodeURIComponent(location.pathname.match(/^\/rooms\/([^/]+)/)?.[1] || ""),
};
export {storageGet, storageSet};
export const refs = ui;
