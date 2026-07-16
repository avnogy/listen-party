import {api, storageGet} from "../shared/api-module.js";
import {appState, config, ui} from "./main-context.js";
import {hasRoomPermission} from "./queue.js";
import {renderState} from "./state-render.js";
import {setRailMode} from "./room.js";
import {syncAudio} from "./player.js";
const {defaultVolume, railModeStorageKey, searchTextStorageKey, searchFieldStorageKey,
  playlistStorageKey, localVolumeStorageKey, localMutedStorageKey, recoveryStorageKey,
  recoveryCooldownMS} = config;
const {audio, togglePlayback: togglePlaybackButton, artwork: artworkEl,
  seek: seekInput, elapsed: elapsedEl, duration: durationEl, mute: muteButton, volume: volumeInput,
  volumeMode: volumeModeButton, searchInput, searchField, libraryStatus,
  } = ui;

function roomAPI(path) {
  return `/rooms/${encodeURIComponent(appState.currentRoomID)}${path}`;
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
  appState.selectedPlaylistID = Number.isInteger(storedPlaylistID) && storedPlaylistID > 0 ? storedPlaylistID : 0;
  const mode = storageGet(railModeStorageKey) === "playlists" ? "playlists" : "library";
  setRailMode(mode, {load: false, persist: false});
}

function closeEvents() {
  appState.events?.close();
  appState.events = null;
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
  const roomID = appState.currentRoomID;
  appState.events = new EventSource(`/rooms/${encodeURIComponent(roomID)}/events`);
  appState.events.addEventListener("state", (event) => {
    if (roomID !== appState.currentRoomID) return;
    try {
      renderState(JSON.parse(event.data));
    } catch (err) {
      recoverPlaybackClient("invalid playback state", err);
    }
  });
  appState.events.addEventListener("disconnect", () => {
    if (roomID !== appState.currentRoomID) return;
    forceLogout();
  });
  appState.events.addEventListener("error", async () => {
    try {
      const info = await api("/api/session");
      if (roomID === appState.currentRoomID && info.disconnected?.[roomID]) forceLogout();
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
  if (appState.lastState && hasMedia()) {
    syncAudio(appState.lastState);
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

function trackSubtitle(track, includeDuration = false) {
  const parts = [trackContext(track), track?.track_no ? `Track ${track.track_no}` : ""];
  if (includeDuration && track?.duration_ms > 0) {
    parts.push(formatTime(track.duration_ms / 1000));
  }
  return parts.filter(Boolean).join(" · ");
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
  const indexedMS = appState.lastState?.current?.track?.duration_ms || 0;
  return indexedMS > 0 ? indexedMS / 1000 : 0;
}

function setSeekUI(position) {
  const duration = mediaDuration();
  const max = duration > 0 ? duration : Math.max(position, 0);
  const value = Math.min(position, max);
  seekInput.max = String(Math.ceil(max));
  seekInput.disabled = !hasMedia() || !hasRoomPermission("playback_control");
  if (!appState.seeking) {
    seekInput.value = String(value);
  }
  elapsedEl.textContent = formatTime(appState.seeking ? Number(seekInput.value) : value);
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
  const localElapsed = Math.max(0, Date.now() - appState.lastStateReceivedAt);
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
  return `listen-party.volumeMode.${appState.currentRoomID || "default"}`;
}

function restoreVolumePreferences() {
  const storedVolume = Number(storageGet(localVolumeStorageKey));
  appState.localVolume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(Number(volumeInput.max), storedVolume)) : 0;
  appState.localMuted = storageGet(localMutedStorageKey) === "true";
  appState.volumeMode = storageGet(volumeModeStorageKey()) === "room" ? "room" : "local";
  renderVolumeControl();
}

function renderVolumeControl() {
  const roomMode = appState.volumeMode === "room";
  const roomAudio = appState.lastState?.room_audio || {volume: defaultVolume, muted: false};
  const canControlRoomVolume = hasRoomPermission("volume_control");
  volumeModeButton.textContent = roomMode ? "Room" : "Local";
  volumeModeButton.setAttribute("aria-pressed", String(roomMode));
  volumeModeButton.title = roomMode ? "Use local volume" : "Use room volume";
  volumeInput.disabled = roomMode && !canControlRoomVolume;
  muteButton.disabled = roomMode && !canControlRoomVolume;
  applyAudioSettings(roomMode ? roomAudio.volume : appState.localVolume, roomMode ? roomAudio.muted : appState.localMuted);
}

function clearArtwork() {
  artworkEl.hidden = true;
  artworkEl.removeAttribute("src");
}

function loadArtwork(track) {
  artworkEl.hidden = true;
  artworkEl.src = mediaURL(track, "/artwork");
}

export {
  roomAPI, restoreSearchPreferences, restoreRailPreferences, closeEvents, forceLogout,
  connectEvents, recoverPlaybackClient, hasMedia, mediaURL, loadMedia, syncCurrentAudio,
  trackTitle, trackContext, trackSubtitle, formatTime,
  mediaDuration, setSeekUI, playbackPosition, renderPlaybackButton, renderVolumeButton,
  applyAudioSettings, volumeModeStorageKey, restoreVolumePreferences, renderVolumeControl,
  clearArtwork, loadArtwork,
};

artworkEl.addEventListener("load", () => {
  artworkEl.hidden = false;
});

artworkEl.addEventListener("error", clearArtwork);
