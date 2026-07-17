// Volume control rendering
import { storageGet, storageSet } from "../../../core/store/persistence.js";
import { hasRoomPermission } from "./permissions.js";

export function volumeModeStorageKey(roomId) {
  return `listen-party.volumeMode.${roomId || "default"}`;
}

export function restoreVolumePreferences(store, ui, audio) {
  const storedVolume = Number(storageGet("listen-party.localVolume"));
  store.setState({
    localVolume: Number.isFinite(storedVolume) ? Math.max(0, Math.min(Number(ui.volumeInput?.max) || 1, storedVolume)) : 0,
    localMuted: storageGet("listen-party.localMuted") === "true",
    volumeMode: storageGet(volumeModeStorageKey(store.getState().currentRoomId)) === "room" ? "room" : "local",
  });
  renderVolumeControl(ui, store, audio, ui.muteButton, applyAudioSettings);
}

export function renderVolumeControl(ui, store, audio, muteButton, applyAudioSettings) {
  const state = store.getState();
  const roomMode = state.volumeMode === "room";
  const roomAudio = state.lastState?.room_audio || { volume: 0.25, muted: false };
  const canControlRoomVolume = hasRoomPermission("volume_control", store);
  if (ui.volumeModeButton) {
    ui.volumeModeButton.textContent = roomMode ? "Room" : "Local";
    ui.volumeModeButton.setAttribute("aria-pressed", String(roomMode));
    ui.volumeModeButton.title = roomMode ? "Use local volume" : "Use room volume";
  }
  if (ui.volumeInput) ui.volumeInput.disabled = roomMode && !canControlRoomVolume;
  if (muteButton) muteButton.disabled = roomMode && !canControlRoomVolume;
  applyAudioSettings(audio, ui.volumeInput, roomMode ? roomAudio.volume : state.localVolume, roomMode ? roomAudio.muted : state.localMuted);
}

export function renderVolumeButton(audio, muteButton) {
  const muted = audio.muted || audio.volume === 0;
  muteButton.title = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  muteButton.classList.toggle("muted", muted);
}

export function applyAudioSettings(audio, volumeInput, value, muted) {
  const max = Number(volumeInput.max) || 1;
  audio.volume = Math.max(0, Math.min(max, value));
  audio.muted = Boolean(muted) || audio.volume === 0;
  volumeInput.value = String(audio.volume);
  renderVolumeButton(audio, muteButton);
}