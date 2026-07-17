// Playback recovery and button rendering
import { closeEvents } from "./events.js";

export function recoverPlaybackClient(reason, error = null, deps) {
  console.error(reason, error || "");
  deps.closeEvents?.();
  if (deps.audio) deps.audio.pause();
  try {
    const previous = Number(sessionStorage.getItem("listen-party.playbackRecoveryAt")) || 0;
    if (Date.now() - previous > 30000) {
      sessionStorage.setItem("listen-party.playbackRecoveryAt", String(Date.now()));
      location.reload();
      return;
    }
  } catch {
    // ignore
  }
  if (deps.ui?.libraryStatus) deps.ui.libraryStatus.textContent = "Playback synchronization failed. Refresh this page.";
}

export function forceLogout(deps) {
  deps.closeEvents?.();
  if (deps.audio) {
    deps.audio.pause();
    deps.audio.removeAttribute("src");
    deps.audio.load();
  }
  location.replace("/logout");
}

export function renderPlaybackButton(playing, togglePlaybackButton) {
  togglePlaybackButton.title = playing ? "Pause" : "Play";
  togglePlaybackButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  const icon = togglePlaybackButton.firstElementChild;
  if (icon) icon.className = `playback-icon ${playing ? "pause-icon" : "play-icon"}`;
}