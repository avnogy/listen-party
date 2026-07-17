// Playback component - audio sync, seek, volume, artwork, playback button
import { recoverPlaybackClient as rawRecover, forceLogout as rawForceLogout, renderPlaybackButton as rawRenderButton } from "../../core/playback.js";
import { syncAudio as rawSyncAudio, loadMedia as rawLoadMedia, clearArtwork as rawClearArtwork, loadArtwork as rawLoadArtwork, setSyncedTime, playAudio, hasMedia, playbackPosition, mediaDuration } from "../../core/audio.js";
import { formatTime } from "../../../core/util.js";
import { storageGet, storageSet } from "../../../core/store/persistence.js";
import { volumeModeStorageKey, renderVolumeControl as rawRenderVolumeControl, renderVolumeButton as rawRenderVolumeButton, applyAudioSettings as rawApplyAudioSettings } from "../../core/volume.js";
import { hasRoomPermission } from "../../core/permissions.js";
import { closeEvents } from "../../core/events.js";
import { trackTitle, trackContext, renderSubtitle, playbackRequester } from "../../queue/render/trackRow.js";

export function createPlaybackComponent(store) {
  const ui = {
    audio: document.getElementById("audio"),
    trackEl: document.getElementById("track"),
    artistEl: document.getElementById("artist"),
    artworkEl: document.getElementById("artwork"),
    seekInput: document.getElementById("seek"),
    elapsedEl: document.getElementById("elapsed"),
    durationEl: document.getElementById("duration"),
    volumeInput: document.getElementById("volume"),
    volumeModeButton: document.getElementById("volumeMode"),
    muteButton: document.getElementById("mute"),
    togglePlaybackButton: document.getElementById("togglePlayback"),
    previousButton: document.getElementById("previous"),
    skipButton: document.getElementById("skip"),
    libraryStatus: document.getElementById("libraryStatus"),
  };

  function setSeekUI(position) {
    const state = store.getState();
    const duration = mediaDuration(state);
    const max = duration > 0 ? duration : Math.max(position, 0);
    const value = Math.min(position, max);
    if (ui.seekInput) {
      ui.seekInput.max = String(Math.ceil(max));
      ui.seekInput.disabled = !hasMedia(state) || !state.currentPermissions?.has("playback_control");
      if (!state.seeking) ui.seekInput.value = String(value);
    }
    if (ui.elapsedEl) ui.elapsedEl.textContent = formatTime(state.seeking ? Number(ui.seekInput?.value) : value);
    if (ui.durationEl) ui.durationEl.textContent = formatTime(duration);
  }

  function syncAudio(state, correctTime = true) {
    rawSyncAudio(state, correctTime, ui.audio, setSyncedTime, playAudio, mediaDuration, playbackPosition, setSeekUI);
  }

  function loadMedia(track) {
    rawLoadMedia(track, ui.audio, (t) => rawLoadArtwork(t, ui.artworkEl));
  }

  function clearArtwork() {
    if (ui.artworkEl) rawClearArtwork(ui.artworkEl);
  }

  function loadArtwork(track) {
    if (ui.artworkEl) rawLoadArtwork(track, ui.artworkEl);
  }

  function renderPlaybackButton(playing) {
    if (ui.togglePlaybackButton) rawRenderButton(playing, ui.togglePlaybackButton);
  }

  function applyAudioSettings(value, muted) {
    rawApplyAudioSettings(ui.audio, ui.volumeInput, value, muted, ui.muteButton);
  }

  function renderVolumeControl() {
    rawRenderVolumeControl(ui, store, ui.audio, ui.muteButton, (audio, volumeInput, value, muted, muteButton) => {
      const max = Number(volumeInput?.max) || 1;
      audio.volume = Math.max(0, Math.min(max, value));
      audio.muted = Boolean(muted) || audio.volume === 0;
      if (volumeInput) volumeInput.value = String(audio.volume);
      rawRenderVolumeButton(audio, muteButton);
    });
  }

  function restoreVolumePreferences() {
    const storedVolume = Number(storageGet("listen-party.localVolume"));
    store.setState({
      localVolume: Number.isFinite(storedVolume) ? Math.max(0, Math.min(Number(ui.volumeInput?.max) || 1, storedVolume)) : 0,
      localMuted: storageGet("listen-party.localMuted") === "true",
      volumeMode: storageGet(volumeModeStorageKey(store.getState().currentRoomId)) === "room" ? "room" : "local",
    });
    renderVolumeControl();
  }

  function recoverPlaybackClient(reason, error = null) {
    rawRecover(reason, error, {
      closeEvents,
      audio: ui.audio,
      ui: { libraryStatus: ui.libraryStatus },
    });
  }

  function forceLogout() {
    rawForceLogout({
      closeEvents,
      audio: ui.audio,
    });
  }

  return {
    start() {
      if (ui.seekInput) {
        ui.seekInput.addEventListener("input", () => {
          store.setState({ seeking: true });
          setSeekUI(Number(ui.seekInput.value));
        });
        ui.seekInput.addEventListener("change", () => {
          store.setState({ seeking: false });
          const value = Number(ui.seekInput.value);
          setSeekUI(value);
          if (ui.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
            ui.audio.currentTime = value;
          }
          window.__queueCommand?.({ action: "seek", position_ms: Math.round(value * 1000) });
        });
      }

      if (ui.togglePlaybackButton) {
        ui.togglePlaybackButton.addEventListener("click", () => {
          const state = store.getState();
          const paused = state.lastState?.paused;
          window.__queueCommand?.({ action: paused ? "play" : "pause" });
        });
      }

      if (ui.previousButton) {
        ui.previousButton.addEventListener("click", () => {
          window.__queueCommand?.({ action: "previous" });
        });
      }

      if (ui.skipButton) {
        ui.skipButton.addEventListener("click", () => {
          window.__queueCommand?.({ action: "skip" });
        });
      }

      if (ui.volumeInput) {
        ui.volumeInput.addEventListener("input", () => {
          const value = Number(ui.volumeInput.value);
          const state = store.getState();
          const roomMode = state.volumeMode === "room";
          if (roomMode) {
            store.setState({ lastState: { ...state.lastState, room_audio: { ...state.lastState?.room_audio, volume: value } } });
          } else {
            store.setState({ localVolume: value });
            storageSet("listen-party.localVolume", String(value));
          }
          applyAudioSettings(roomMode ? state.lastState?.room_audio?.volume : value, roomMode ? state.lastState?.room_audio?.muted : state.localMuted);
        });
      }

      if (ui.volumeModeButton) {
        ui.volumeModeButton.addEventListener("click", () => {
          const current = store.getState().volumeMode;
          const next = current === "room" ? "local" : "room";
          store.setState({ volumeMode: next });
          storageSet(`listen-party.volumeMode.${store.getState().currentRoomId || "default"}`, next);
          renderVolumeControl();
        });
      }

      if (ui.muteButton) {
        ui.muteButton.addEventListener("click", () => {
          const state = store.getState();
          const roomMode = state.volumeMode === "room";
          const muted = roomMode ? !state.lastState?.room_audio?.muted : !state.localMuted;
          if (roomMode) {
            store.setState({ lastState: { ...state.lastState, room_audio: { ...state.lastState?.room_audio, muted } } });
          } else {
            store.setState({ localMuted: muted });
            storageSet("listen-party.localMuted", String(muted));
          }
          renderVolumeControl();
        });
      }

      restoreVolumePreferences();
    },

    render(state, timelineChanged) {
      const currentTrack = state.current?.track;

      if (!currentTrack) {
        ui.audio?.pause();
        ui.audio?.removeAttribute("src");
        ui.audio?.load();
        clearArtwork();
        setSeekUI(0);
        if (ui.trackEl) ui.trackEl.textContent = "Nothing playing";
        if (ui.artistEl) ui.artistEl.textContent = "";
      } else {
        if (ui.trackEl) ui.trackEl.textContent = trackTitle(currentTrack);
        if (ui.artistEl) {
          renderSubtitle(ui.artistEl, trackContext(currentTrack) || "", playbackRequester(state.current));
        }
        loadMedia(currentTrack);
        syncAudio(state, timelineChanged);
      }

      renderVolumeControl();
      renderPlaybackButton(Boolean(currentTrack && !state.paused));

      if (ui.previousButton) ui.previousButton.disabled = !store.getState().currentPermissions.has("playback_control") || (state.history || []).length === 0;
      if (ui.skipButton) ui.skipButton.disabled = !store.getState().currentPermissions.has("playback_control");
      if (ui.togglePlaybackButton) ui.togglePlaybackButton.disabled = !store.getState().currentPermissions.has("playback_control") || (!currentTrack && (state.queue || []).length === 0);
    },

    onGenerationChange() {
      ui.audio?.pause();
      ui.audio?.removeAttribute("src");
      ui.audio?.load();
      clearArtwork();
    },

    // Public API for other components
    recoverPlaybackClient,
    forceLogout,
    renderPlaybackButton,
    loadMedia,
    clearArtwork,
    syncAudio,
    setSeekUI,
    restoreVolumePreferences,
    renderVolumeControl,
    applyAudioSettings,
  };
}
