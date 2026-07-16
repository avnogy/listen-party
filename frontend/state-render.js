import {appState, ui} from "./main-context.js";
import {api} from "./api-module.js";
import {roomAPI, recoverPlaybackClient, loadMedia, trackTitle, trackContext, renderPlaybackButton, renderVolumeControl, setSeekUI} from "./core.js";
import {syncAudio, updateQueueSortable} from "./player.js";
import {command, hasRoomPermission, playbackRequester, refreshPermissionControls, renderHistory, renderQueueItem} from "./queue.js";
import {clearArtwork} from "./core.js";
import {renderSubtitle} from "./queue.js";
import {emptyHint} from "./playlists.js";
const { artist: artistEl, audio, autoDJ: autoDJButton, autoDJSource: autoDJSourceButton, autoDJSourceMenu, clearHistory: clearHistoryButton, clearQueue: clearQueueButton, listenerList: listenerListEl, presence: presenceEl, previous: previousButton, queueChangesButton, queueChangesList: queueChangesListEl, queue: queueEl, skip: skipButton, togglePlayback: togglePlaybackButton, track: trackEl } = ui;
// Playback state rendering and live presence.

function samePlaybackTimeline(a, b) {
  return Boolean(a && b
    && a.current?.dedupe_key === b.current?.dedupe_key
    && a.started_at === b.started_at
    && a.paused === b.paused
    && a.position_at_pause_ms === b.position_at_pause_ms);
}

function renderState(state) {
  const revision = Number(state?.revision);
  const serverTime = Date.parse(state?.server_time);
  if (typeof state?.generation !== "string" || !state.generation || !Number.isSafeInteger(revision) || revision < 0 || !Number.isFinite(serverTime)) {
    recoverPlaybackClient("malformed playback state");
    return;
  }
  if (state.room_id && appState.currentRoomID && state.room_id !== appState.currentRoomID) {
    return;
  }
  if (appState.lastState) {
    if (state.generation !== appState.lastState.generation) {
      // A backend restart has a new generation. Reopen the media stream and
      // render the restored state directly instead of reloading the page.
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      clearArtwork();
      appState.lastState = null;
      appState.lastStateReceivedAt = 0;
      appState.pendingQueueState = null;
    } else {
      const lastRevision = Number(appState.lastState.revision);
      const lastServerTime = Date.parse(appState.lastState.server_time);
      if (revision < lastRevision) return;
      if (revision === lastRevision && serverTime < lastServerTime) return;
    }
  }
  if (appState.queueDragActive || appState.queueReorderPending) {
    if (!appState.pendingQueueState || Date.parse(state.server_time) >= Date.parse(appState.pendingQueueState.server_time)) {
      appState.pendingQueueState = state;
    }
    return;
  }
  if (Array.isArray(state.permissions)) {
    appState.currentPermissions = new Set(state.permissions);
  }

  const timelineChanged = !samePlaybackTimeline(appState.lastState, state);
  appState.lastState = state;
  appState.lastStateReceivedAt = Date.now();

  const queue = state.queue || [];
  const history = state.history || [];
  const current = state.current;
  const currentTrack = current?.track;
  if (!currentTrack) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    clearArtwork();
    setSeekUI(0);
    trackEl.textContent = "Nothing playing";
    artistEl.textContent = "";
  } else {
    trackEl.textContent = trackTitle(currentTrack);
    renderSubtitle(artistEl, trackContext(currentTrack), playbackRequester(current));
  loadMedia(currentTrack);
    syncAudio(state, timelineChanged);
  }

  queueEl.replaceChildren(...(queue.length ? queue.map(renderQueueItem) : [emptyHint("Queue is empty", "li")]));
  renderHistory(history);
  const canManageQueue = hasRoomPermission("queue_manage");
  const canControlPlayback = hasRoomPermission("playback_control");
  clearQueueButton.hidden = !canManageQueue || queue.length === 0;
  const autoDJ = state.auto_dj || {enabled: false, source: {type: "library", name: "Entire Library"}};
  autoDJButton.disabled = !canManageQueue;
  autoDJSourceButton.disabled = !canManageQueue;
  if (!canManageQueue) closeAutoDJSourceMenu();
  autoDJButton.dataset.enabled = String(Boolean(autoDJ.enabled));
  autoDJButton.setAttribute("aria-pressed", String(Boolean(autoDJ.enabled)));
  autoDJButton.title = autoDJ.enabled ? "Disable Auto-DJ" : "Enable Auto-DJ";
  autoDJButton.setAttribute("aria-label", autoDJButton.title);
  autoDJSourceButton.textContent = autoDJ.source?.name || "Entire Library";
  autoDJSourceButton.title = `Auto-DJ source: ${autoDJSourceButton.textContent}`;
  renderVolumeControl();
  clearHistoryButton.hidden = !canManageQueue || history.length === 0;
  renderPresence(state);
  renderQueueChanges(state.actions || []);
  previousButton.disabled = !canControlPlayback || history.length === 0;
  skipButton.disabled = !canControlPlayback;
  togglePlaybackButton.disabled = !canControlPlayback || (!currentTrack && queue.length === 0);
  refreshPermissionControls();
  updateQueueSortable();
  renderPlaybackButton(Boolean(currentTrack && !state.paused));
}

function renderQueueChanges(actions) {
  queueChangesButton.dataset.empty = String(actions.length === 0);
  queueChangesButton.textContent = actions.length ? `Queue changes ${actions.length}` : "Queue changes";
  queueChangesListEl.replaceChildren(...actions.map((action) => {
    const item = document.createElement("div");
    item.className = "queue-change-item";

    const meta = document.createElement("div");
    meta.className = "queue-change-meta";
    const metadata = [
      [formatActionTime(action.at), "queue-change-time"],
      [action.ip, "queue-change-ip"],
      [action.username, "queue-change-username"],
    ];
    for (const [value, className] of metadata) {
      if (!value) continue;
      const field = document.createElement("span");
      field.className = className;
      field.textContent = value;
      meta.append(field);
    }

    const text = document.createElement("div");
    text.className = "queue-change-text";
    text.textContent = action.text || "";

    item.append(meta, text);
    return item;
  }));
  if (actions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "queue-change-empty";
    empty.textContent = "No queue changes yet";
    queueChangesListEl.append(empty);
  }
}

function formatActionTime(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat(undefined, {hour: "2-digit", minute: "2-digit"}).format(new Date(time));
}

function renderPresence(state) {
  const listeners = Array.isArray(state.listeners) ? state.listeners : [];
  const count = listeners.length;
  presenceEl.textContent = `${count} listener${count === 1 ? "" : "s"}`;
  listenerListEl.replaceChildren(...listeners.map((username) => {
    const item = document.createElement("div");
    item.className = "listener-item";
  const name = document.createElement("span");
  name.className = "listener-name";
  name.textContent = username;
  item.append(name);
  if (appState.canAdministerCurrentRoom) {
    const disconnect = document.createElement("button");
    disconnect.className = "secondary compact listener-disconnect";
    disconnect.type = "button";
    disconnect.textContent = "Disconnect";
    disconnect.addEventListener("click", async () => {
      disconnect.disabled = true;
      try {
        await api(roomAPI("/api/admin/disconnect"), {
          method: "POST",
          body: JSON.stringify({username}),
        });
      } catch (err) {
        console.error(err);
        disconnect.disabled = false;
      }
    });
    item.append(disconnect);
  }
    return item;
  }));
  if (listeners.length === 0) {
    const empty = document.createElement("div");
    empty.className = "listener-item empty";
    empty.textContent = "No active users";
    listenerListEl.append(empty);
  }
}

function closeAutoDJSourceMenu() {
  autoDJSourceMenu.hidden = true;
  autoDJSourceButton.setAttribute("aria-expanded", "false");
}

function renderAutoDJSourceMenu(availablePlaylists) {
  const selected = appState.lastState?.auto_dj?.source || {type: "library"};
  const sources = [
    {type: "library", name: "Entire Library"},
    ...availablePlaylists.map((playlist) => ({type: "playlist", playlist_id: playlist.id, name: playlist.name})),
  ];
  autoDJSourceMenu.replaceChildren(...sources.map((source) => {
    const active = source.type === selected.type && (source.type !== "playlist" || source.playlist_id === selected.playlist_id);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "auto-dj-source-option";
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(active));
    item.textContent = source.name;
    item.addEventListener("click", async () => {
      if (active) {
        closeAutoDJSourceMenu();
        return;
      }
      item.disabled = true;
      try {
        await command({
          action: "auto_dj_source",
          source: source.type === "playlist" ? {type: "playlist", playlist_id: source.playlist_id} : {type: "library"},
        });
        closeAutoDJSourceMenu();
      } catch (err) {
        console.error(err);
        item.disabled = false;
        const error = document.createElement("p");
        error.className = "auto-dj-source-error";
        error.textContent = err.message || "Could not change Auto-DJ source";
        autoDJSourceMenu.append(error);
      }
    });
    return item;
  }));
}

export {renderState, renderAutoDJSourceMenu, closeAutoDJSourceMenu};
