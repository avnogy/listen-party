// Track row rendering
import { storageGet, storageSet } from "../../../core/store/persistence.js";
import { trackActionGroup } from "./commands.js";

export function trackMeta(titleText, subtitleText, requestedBy = "") {
  const meta = document.createElement("div");
  meta.className = "meta";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = titleText;
  const sub = document.createElement("div");
  sub.className = "sub";
  renderSubtitle(sub, subtitleText, requestedBy);
  meta.append(title, sub);
  return meta;
}

export function renderSubtitle(element, subtitleText, requestedBy = "") {
  element.replaceChildren();
  if (subtitleText) {
    const context = document.createElement("span");
    context.className = "track-context";
    context.textContent = subtitleText;
    element.append(context);
  }
  if (!requestedBy) return;
  if (subtitleText) element.append(document.createTextNode(" - Queued by "));
  else element.append(document.createTextNode("Queued by "));
  const requester = document.createElement("span");
  requester.className = "requester";
  requester.textContent = requestedBy;
  element.append(requester);
}

export function trackTitle(track) {
  return track?.title || "Unknown title";
}

export function trackContext(track) {
  const parts = [];
  if (track?.artist) parts.push(track.artist);
  if (track?.album) parts.push(track.album);
  return parts.join(" - ");
}

export function trackSubtitle(track, showDuration = false) {
  const parts = [];
  const ctx = trackContext(track);
  if (ctx) parts.push(ctx);
  if (showDuration && track?.duration_ms) {
    parts.push(formatTime(track.duration_ms / 1000));
  }
  return parts.join(" - ");
}

export function playbackRequester(item) {
  return item?.requested_by || item?.requester || "";
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function trackRow(track, commandSpecs, requestedBy = "", dedupeKey = track?.dedupe_key || "", extraButtons = [], showDuration = false) {
  const row = document.createElement("div");
  row.className = "item";
  const subtitle = trackSubtitle(track, showDuration);
  const meta = trackMeta(trackTitle(track), subtitle, requestedBy);
  const actionEl = trackActionGroup(commandSpecs, dedupeKey, extraButtons);
  row.append(meta, actionEl);
  return row;
}