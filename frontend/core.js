// Shared page state and small helpers. Feature files below rely on this file
// being loaded first; keeping this contract explicit avoids a framework or
// build step while making ownership easy to find.

const audio = document.getElementById("audio");
const trackEl = document.getElementById("track");
const artistEl = document.getElementById("artist");
const queueEl = document.getElementById("queue");
const historyEl = document.getElementById("history");
const resultsEl = document.getElementById("results");
const presenceEl = document.getElementById("presence");
const presenceButton = document.getElementById("presenceButton");
const listenerListEl = document.getElementById("listenerList");
const clearQueueButton = document.getElementById("clearQueue");
const autoDJButton = document.getElementById("autoDJ");
const autoDJSourceButton = document.getElementById("autoDJSource");
const autoDJSourceMenu = document.getElementById("autoDJSourceMenu");
const clearHistoryButton = document.getElementById("clearHistory");
const previousButton = document.getElementById("previous");
const skipButton = document.getElementById("skip");
const togglePlaybackButton = document.getElementById("togglePlayback");
const artworkEl = document.getElementById("artwork");
const seekInput = document.getElementById("seek");
const elapsedEl = document.getElementById("elapsed");
const durationEl = document.getElementById("duration");
const muteButton = document.getElementById("mute");
const volumeInput = document.getElementById("volume");
const volumeModeButton = document.getElementById("volumeMode");
const queueChangesButton = document.getElementById("queueChangesButton");
const queueChangesListEl = document.getElementById("queueChangesList");
const searchInput = document.getElementById("q");
const searchField = document.getElementById("searchField");
const libraryStatus = document.getElementById("libraryStatus");
const libraryTab = document.getElementById("libraryTab");
const playlistsTab = document.getElementById("playlistsTab");
const libraryPanel = document.getElementById("libraryPanel");
const libraryViews = document.querySelectorAll(".library-view");
const playlistsView = document.getElementById("playlistsView");
const playlistSelect = document.getElementById("playlistSelect");
const deletePlaylistButton = document.getElementById("deletePlaylist");
const playlistDetailEl = document.getElementById("playlistDetail");
const newPlaylistButton = document.getElementById("newPlaylist");
const playlistCreatePanel = document.getElementById("playlistCreatePanel");
const playlistCreateForm = document.getElementById("playlistCreateForm");
const playlistNameInput = document.getElementById("playlistName");
const importPlaylistFolderButton = document.getElementById("importPlaylistFolder");
const playlistFolderInput = document.getElementById("playlistFolderInput");
const playlistImportStatus = document.getElementById("playlistImportStatus");
const roomSettingsView = document.getElementById("roomSettingsView");
const roomSettingsGrants = document.getElementById("roomSettingsGrants");
const roomSettingsStatus = document.getElementById("roomSettingsStatus");
const saveRoomSettingsButton = document.getElementById("saveRoomSettings");
const roomSettingsButton = document.getElementById("roomSettingsButton");
const closeRoomSettingsButton = document.getElementById("closeRoomSettings");
const currentUserEl = document.getElementById("currentUser");
const roomSelect = document.getElementById("roomSelect");
const logoutForm = document.getElementById("logoutForm");
const defaultVolume = 0.25;
const syncToleranceSeconds = 0.3;
const searchDebounceMS = 300;
const searchTextStorageKey = "listen-party.searchText";
const searchFieldStorageKey = "listen-party.searchField";
const railModeStorageKey = "listen-party.railMode";
const playlistStorageKey = "listen-party.selectedPlaylist";
const localVolumeStorageKey = "listen-party.localVolume";
const localMutedStorageKey = "listen-party.localMuted";
const minimumRoomSaveFeedbackMS = 450;
const roomSaveResultVisibleMS = 1400;
const recoveryStorageKey = "listen-party.playbackRecoveryAt";
const recoveryCooldownMS = 30000;

let lastState = null;
let lastStateReceivedAt = 0;
let searchTimer = 0;
let seeking = false;
let events = null;
let playlists = [];
let selectedPlaylistID = 0;
let currentPermissions = new Set();
let queueSortable = null;
let queueDragActive = false;
let queueReorderPending = false;
let pendingQueueState = null;
let canAdministerCurrentRoom = false;
let roomSaveFeedbackTimer = 0;
let volumeMode = "local";
let localVolume = 0;
let localMuted = false;

let currentRoomID = decodeURIComponent(location.pathname.match(/^\/rooms\/([^/]+)/)?.[1] || "");

function roomAPI(path) {
  return `/rooms/${encodeURIComponent(currentRoomID)}${path}`;
}

function storageGet(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function restoreSearchPreferences() {
  searchInput.value = storageGet(searchTextStorageKey);
  const field = storageGet(searchFieldStorageKey);
  if ([...searchField.options].some((option) => option.value === field)) {
    searchField.value = field;
  }
}

function restoreRailPreferences() {
  const storedPlaylistID = Number(storageGet(playlistStorageKey));
  selectedPlaylistID = Number.isInteger(storedPlaylistID) && storedPlaylistID > 0 ? storedPlaylistID : 0;
  const mode = storageGet(railModeStorageKey) === "playlists" ? "playlists" : "library";
  setRailMode(mode, {load: false, persist: false});
}

function closeEvents() {
  events?.close();
  events = null;
}

function forceLogout() {
  closeEvents();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  location.replace("/logout");
}

function connectEvents() {
  closeEvents();
  const roomID = currentRoomID;
  events = new EventSource(`/rooms/${encodeURIComponent(roomID)}/events`);
  events.addEventListener("state", (event) => {
    if (roomID !== currentRoomID) return;
    try {
      renderState(JSON.parse(event.data));
    } catch (err) {
      recoverPlaybackClient("invalid playback state", err);
    }
  });
  events.addEventListener("disconnect", () => {
    if (roomID !== currentRoomID) return;
    forceLogout();
  });
  events.addEventListener("error", async () => {
    try {
      const info = await api("/api/session");
      if (roomID === currentRoomID && info.disconnected?.[roomID]) forceLogout();
    } catch {
      // A network outage is not an administrative disconnect.
    }
  });
}

function recoverPlaybackClient(reason, error = null) {
  console.error(reason, error || "");
  closeEvents();
  audio.pause();
  try {
    const previous = Number(sessionStorage.getItem(recoveryStorageKey)) || 0;
    if (Date.now() - previous > recoveryCooldownMS) {
      sessionStorage.setItem(recoveryStorageKey, String(Date.now()));
      location.reload();
      return;
    }
  } catch {
    // Without storage, do not risk a refresh loop.
  }
  libraryStatus.textContent = "Playback synchronization failed. Refresh this page.";
}

function hasMedia() {
  return audio.hasAttribute("src");
}

function mediaURL(track, suffix = "") {
  return `/media/${track.id}${suffix}?v=${encodeURIComponent(track.dedupe_key || "")}`;
}

function loadMedia(track) {
  const src = mediaURL(track);
  if (audio.getAttribute("src") === src) {
    return;
  }
  audio.src = src;
  audio.load();
  loadArtwork(track);
}

function syncCurrentAudio() {
  if (lastState && hasMedia()) {
    syncAudio(lastState);
  }
}

function trackTitle(track) {
  if (!track) return "";
  return (track.title || `Track ${track.id || ""}`).trim();
}

function trackContext(track) {
  if (!track) return "";
  return [track.artist, track.album].filter(Boolean).join(" · ");
}

function trackSubtitle(track) {
  return [trackContext(track), track?.track_no ? `Track ${track.track_no}` : ""].filter(Boolean).join(" · ");
}

function trackSubtitleWithDuration(track) {
  const duration = track?.duration_ms > 0 ? formatTime(track.duration_ms / 1000) : "";
  return [trackSubtitle(track), duration].filter(Boolean).join(" · ");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function mediaDuration() {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }
  const indexedMS = lastState?.current?.track?.duration_ms || 0;
  return indexedMS > 0 ? indexedMS / 1000 : 0;
}

function setSeekUI(position) {
  const duration = mediaDuration();
  const max = duration > 0 ? duration : Math.max(position, 0);
  const value = Math.min(position, max);
  seekInput.max = String(Math.ceil(max));
  seekInput.disabled = !hasMedia() || !hasRoomPermission("playback_control");
  if (!seeking) {
    seekInput.value = String(value);
  }
  elapsedEl.textContent = formatTime(seeking ? Number(seekInput.value) : value);
  durationEl.textContent = formatTime(duration);
}

function playbackPosition(state) {
  if (!state.started_at) {
    return 0;
  }
  if (state.paused) {
    return Math.max(0, state.position_at_pause_ms / 1000);
  }
  const serverNow = Date.parse(state.server_time);
  const startedAt = Date.parse(state.started_at);
  const localElapsed = Math.max(0, Date.now() - lastStateReceivedAt);
  return Math.max(0, (serverNow - startedAt + localElapsed) / 1000);
}

function renderPlaybackButton(playing) {
  togglePlaybackButton.title = playing ? "Pause" : "Play";
  togglePlaybackButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  togglePlaybackButton.firstElementChild.className = `playback-icon ${playing ? "pause-icon" : "play-icon"}`;
}

function renderVolumeButton() {
  const muted = audio.muted || audio.volume === 0;
  muteButton.title = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  muteButton.classList.toggle("muted", muted);
}

function applyAudioSettings(value, muted) {
  const max = Number(volumeInput.max) || 1;
  audio.volume = Math.max(0, Math.min(max, value));
  audio.muted = Boolean(muted) || audio.volume === 0;
  volumeInput.value = String(audio.volume);
  renderVolumeButton();
}

function volumeModeStorageKey() {
  return `listen-party.volumeMode.${currentRoomID || "default"}`;
}

function restoreVolumePreferences() {
  const storedVolume = Number(storageGet(localVolumeStorageKey));
  localVolume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(Number(volumeInput.max), storedVolume)) : 0;
  localMuted = storageGet(localMutedStorageKey) === "true";
  volumeMode = storageGet(volumeModeStorageKey()) === "room" ? "room" : "local";
  renderVolumeControl();
}

function renderVolumeControl() {
  const roomMode = volumeMode === "room";
  const roomAudio = lastState?.room_audio || {volume: defaultVolume, muted: false};
  const canControlRoomVolume = hasRoomPermission("volume_control");
  volumeModeButton.textContent = roomMode ? "Room" : "Local";
  volumeModeButton.setAttribute("aria-pressed", String(roomMode));
  volumeModeButton.title = roomMode ? "Use local volume" : "Use room volume";
  volumeInput.disabled = roomMode && !canControlRoomVolume;
  muteButton.disabled = roomMode && !canControlRoomVolume;
  applyAudioSettings(roomMode ? roomAudio.volume : localVolume, roomMode ? roomAudio.muted : localMuted);
}

function clearArtwork() {
  artworkEl.hidden = true;
  artworkEl.removeAttribute("src");
}

function loadArtwork(track) {
  artworkEl.hidden = true;
  artworkEl.src = mediaURL(track, "/artwork");
}

artworkEl.addEventListener("load", () => {
  artworkEl.hidden = false;
});

artworkEl.addEventListener("error", clearArtwork);
