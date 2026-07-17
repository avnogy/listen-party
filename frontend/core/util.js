// Core utilities - formatting, DOM helpers, status

// Time formatting
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function formatRate(value) {
  if (!Number.isFinite(value)) return "0/s";
  return `${value.toFixed(value >= 10 ? 0 : 1)}/s`;
}

export function shortPath(path) {
  return (path || "").split(/[\\/]/).filter(Boolean).pop() || path;
}

export function formatScanTime(value) {
  if (!value || value === "0001-01-01T00:00:00Z") return "Never rescanned";
  return `Last rescanned ${new Date(value).toLocaleString()}`;
}

// DOM helpers
export function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.dataset.kind = kind;
}

export function toggleHidden(element, hidden) {
  element.hidden = hidden;
}

export function toggleClass(element, className, force) {
  element.classList.toggle(className, force);
}

export function renderEmptyState(text, tag = "p", className = "hint empty-state") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// Query helpers
export function id(id) {
  return document.getElementById(id);
}

export function all(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function element(tag, { className, text, dataset, ...attributes } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  if (dataset) Object.assign(el.dataset, dataset);
  for (const [name, value] of Object.entries(attributes)) {
    if (value == null) continue;
    if (name in el && !name.startsWith("aria-") && name !== "role") {
      el[name] = value;
    } else {
      el.setAttribute(name, String(value));
    }
  }
  return el;
}

export function replaceChildren(container, children) {
  container.replaceChildren(...children);
}

export function createEvent(name, detail) {
  return new CustomEvent(name, { detail });
}

// Playback button rendering (used by PlaybackControls component)
export function renderPlaybackButton(playing, togglePlaybackButton) {
  togglePlaybackButton.title = playing ? "Pause" : "Play";
  togglePlaybackButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  const icon = togglePlaybackButton.firstElementChild;
  if (icon) icon.className = `playback-icon ${playing ? "pause-icon" : "play-icon"}`;
}

export function renderVolumeButton(audio, muteButton) {
  const muted = audio.muted || audio.volume === 0;
  muteButton.title = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  muteButton.classList.toggle("muted", muted);
}