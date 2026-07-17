// Playback rendering and sync
import { formatTime } from "../../../core/util.js";
import { mediaURL } from "../../../core/api/endpoints.js";

export function renderPlaybackButton(playing, togglePlaybackButton) {
  togglePlaybackButton.title = playing ? "Pause" : "Play";
  togglePlaybackButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  const icon = togglePlaybackButton.firstElementChild;
  if (icon) icon.className = `playback-icon ${playing ? "pause-icon" : "play-icon"}`;
}

export function setSeekUI(seekInput, elapsedEl, durationEl, audio, state, store, seeking, hasMedia, formatTime, mediaDuration, playbackPosition) {
  const duration = mediaDuration(state);
  const max = duration > 0 ? duration : Math.max(seeking ? Number(seekInput.value) : 0, 0);
  const value = Math.min(seeking ? Number(seekInput.value) : 0, max);
  seekInput.max = String(Math.ceil(max));
  seekInput.disabled = !hasMedia(state) || !store.getState().currentPermissions.has("playback_control");
  if (!store.getState().seeking) seekInput.value = String(value);
  elapsedEl.textContent = formatTime(seeking ? Number(seekInput.value) : value);
  durationEl.textContent = formatTime(duration);
}

export function syncCurrentAudio(state, audio, syncAudio) {
  if (state.lastState && hasMedia(state)) {
    syncAudio(state.lastState);
  }
}

export function loadMedia(track, audio, loadArtwork) {
  const src = mediaURL(track);
  if (audio.getAttribute("src") === src) return;
  audio.src = src;
  audio.load();
  loadArtwork(track);
}

export function clearArtwork(artworkEl) {
  artworkEl.hidden = true;
  artworkEl.removeAttribute("src");
}

export function loadArtwork(track, artworkEl) {
  artworkEl.hidden = true;
  artworkEl.src = mediaURL(track, "/artwork");
}

export function mediaDuration(state) {
  if (Number.isFinite(state.audio?.duration) && state.audio.duration > 0) return state.audio.duration;
  const indexedMs = state.lastState?.current?.track?.duration_ms || 0;
  return indexedMs > 0 ? indexedMs / 1000 : 0;
}

export function playbackPosition(state) {
  if (!state.started_at) return 0;
  if (state.paused) return Math.max(0, state.position_at_pause_ms / 1000);
  const serverNow = Date.parse(state.server_time);
  const startedAt = Date.parse(state.started_at);
  const localElapsed = Math.max(0, Date.now() - state.lastStateReceivedAt);
  return Math.max(0, (serverNow - startedAt + localElapsed) / 1000);
}

export function setSyncedTime(target, audio) {
  if (!Number.isFinite(target)) return;
  if (audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
  if (Math.abs(audio.currentTime - target) > 0.3) {
    try {
      audio.currentTime = target;
    } catch (err) {
      console.warn("could not seek synchronized media yet", err);
    }
  }
}

export function playAudio(audio) {
  if (!hasMedia(store.getState())) return;
  audio.play().catch((err) => console.warn("browser refused synchronized playback", err));
}

export function syncAudio(state, correctTime = true, audio, setSyncedTime, playAudio, mediaDuration, playbackPosition, setSeekUI) {
  if (!state.started_at) {
    setSeekUI(0);
    return;
  }
  const target = playbackPosition(state);
  const duration = mediaDuration(state);
  if (!state.paused && duration > 0 && target > duration) {
    setSeekUI(duration);
    return;
  }
  if (state.paused) {
    setSeekUI(target);
    if (correctTime) setSyncedTime(target, audio);
    if (audio && !audio.paused) audio.pause();
    return;
  }
  if (correctTime) setSyncedTime(target, audio);
  if (audio?.paused) audio.play().catch((err) => console.warn("browser refused synchronized playback", err));
  setSeekUI(audio?.readyState >= HTMLMediaElement.HAVE_METADATA ? audio.currentTime : target);
}

export function hasMedia(state) {
  return state.audio?.hasAttribute("src") === true;
}