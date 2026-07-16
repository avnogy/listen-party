// Queue, history, track rows, and queue reordering.

function renderQueueItem(item) {
  const li = document.createElement("li");
  li.className = "item queue-item";
  li.dataset.queueItemId = String(item.id);

  const track = item.track;
  const meta = trackMeta(
    track ? trackTitle(track) : "Unavailable track",
    track ? trackSubtitleWithDuration(track) : "",
    playbackRequester(item)
  );

  const actions = trackActionGroup([], item.dedupe_key, [
    commandTrashButton("Remove from queue", {action: "queue_remove", queue_item_id: item.id}),
  ]);

  if (hasRoomPermission("queue_manage")) {
    li.classList.add("queue-item-draggable");
    li.append(queueDragHandle(item), meta, actions);
  } else {
    li.append(meta, actions);
  }
  return li;
}

function queueDragHandle(item) {
  const handle = document.createElement("button");
  handle.className = "queue-drag-handle";
  handle.type = "button";
  handle.title = "Drag to reorder";
  handle.setAttribute("aria-label", `Reorder ${item.track ? trackTitle(item.track) : "unavailable track"}`);
  const icon = document.createElement("span");
  icon.className = "queue-drag-icon";
  icon.setAttribute("aria-hidden", "true");
  handle.append(icon);
  handle.addEventListener("keydown", (event) => {
    handleQueueReorderKey(event, item.id);
  });
  return handle;
}

function handleQueueReorderKey(event, queueItemID) {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || queueReorderPending) return;
  const item = event.currentTarget.closest(".queue-item");
  if (!item) return;
  let before = null;
  if (event.key === "ArrowUp") {
    before = item.previousElementSibling;
    if (!before) return;
  } else if (event.key === "ArrowDown") {
    const next = item.nextElementSibling;
    if (!next) return;
    before = next.nextElementSibling;
  } else if (event.key === "Home") {
    before = queueEl.firstElementChild;
    if (before === item) return;
  }
  event.preventDefault();
  const beforeQueueItemID = before ? Number(before.dataset.queueItemId) : 0;
  submitQueueReorder(queueItemID, beforeQueueItemID).then(() => {
    queueEl.querySelector(`[data-queue-item-id="${queueItemID}"] .queue-drag-handle`)?.focus();
  });
}

function renderHistoryItem(item) {
  const track = item.track;
  const dedupeKey = item.dedupe_key;
  return trackRow(track || {title: "Unavailable track", dedupe_key: dedupeKey}, standardTrackCommands(dedupeKey), playbackRequester(item), dedupeKey, [], true);
}

function playbackRequester(item) {
  return item?.source === "auto_dj" ? "Auto-DJ" : (item?.requested_by || "");
}

function renderHistory(history) {
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No previously played tracks";
    historyEl.replaceChildren(empty);
    return;
  }
  historyEl.replaceChildren(...history.map(renderHistoryItem));
}

function commandButton(text, body) {
  const button = document.createElement("button");
  button.className = "secondary compact row-command-button";
  button.title = text;
  button.setAttribute("aria-label", text);
  button.dataset.roomAction = body.action;
  const icon = commandIcon(body.action);
  if (icon) {
    const iconEl = document.createElement("span");
    iconEl.className = "command-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = icon;
    button.append(iconEl);
  }
  const label = document.createElement("span");
  label.className = "command-label";
  label.textContent = text;
  button.append(label);
  button.hidden = !canRunCommand(body.action);
  button.addEventListener("click", async (event) => {
    await command(body);
    if (event.detail > 0) button.blur();
  });
  return button;
}

function commandIcon(action) {
  if (action === "queue_add") return "≡+";
  if (action === "play_now" || action === "play") return "▶";
  return "";
}

function commandTrashButton(label, body) {
  const button = trashButton(label, async () => {
    await command(body);
  });
  button.dataset.roomAction = body.action;
  button.hidden = !canRunCommand(body.action);
  return button;
}

function trashButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "secondary compact icon-only trash-button";
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(document.createElement("span"));
  button.addEventListener("click", onClick);
  return button;
}

function refreshPermissionControls() {
  document.querySelectorAll("[data-room-action]").forEach((button) => {
    button.hidden = !canRunCommand(button.dataset.roomAction);
  });
  document.querySelectorAll(".item .row-actions").forEach(updateRowActionLayout);
  updatePlaylistActionButtons();
}

function updateRowActionLayout(actions) {
  const visibleRoomActions = [...actions.querySelectorAll("[data-room-action]")].filter((button) => !button.hidden);
  const hasRoomActions = visibleRoomActions.length > 0;
  const hasPlaylistAction = Boolean(actions.querySelector(".playlist-more-button"));
  const hasStandaloneAction = [...actions.children].some((element) => element.matches("button:not([data-room-action])") && !element.hidden);
  actions.classList.toggle("playlist-only", !hasRoomActions && hasPlaylistAction);
  actions.classList.toggle("no-actions", !hasRoomActions && !hasPlaylistAction && !hasStandaloneAction);
  actions.classList.toggle("single-room-action", visibleRoomActions.length === 1);
  actions.classList.toggle("has-standalone-action", hasStandaloneAction);
  actions.classList.toggle("standalone-only", !hasRoomActions && !hasPlaylistAction && hasStandaloneAction);
}

function hasRoomPermission(permission) {
  return currentPermissions.has(permission);
}

function canRunCommand(action) {
  if (["play", "play_now", "pause", "previous", "seek", "skip"].includes(action)) {
    return hasRoomPermission("playback_control");
  }
  if (action === "queue_add") {
    return hasRoomPermission("queue_add");
  }
  return hasRoomPermission("queue_manage");
}

function trackMeta(titleText, subtitleText, requestedBy = "") {
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

function standardTrackCommands(dedupeKey) {
  if (!dedupeKey) return [];
  return [
    ["Queue", {action: "queue_add", dedupe_key: dedupeKey}],
    ["Play", {action: "play_now", dedupe_key: dedupeKey}],
  ];
}

function trackActionGroup(commandSpecs, dedupeKey, extraButtons = []) {
  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(...commandSpecs.map(([text, body]) => commandButton(text, body)));
  if (dedupeKey) {
    actions.append(addToPlaylistButton(dedupeKey));
  }
  actions.append(...extraButtons);
  updateRowActionLayout(actions);
  return actions;
}

function trackRow(track, commandSpecs, requestedBy = "", dedupeKey = track?.dedupe_key || "", extraButtons = [], showDuration = false) {
  const row = document.createElement("div");
  row.className = "item";

  const subtitle = showDuration ? trackSubtitleWithDuration(track) : trackSubtitle(track);
  const meta = trackMeta(trackTitle(track), subtitle, requestedBy);
  const actionEl = trackActionGroup(commandSpecs, dedupeKey, extraButtons);

  row.append(meta, actionEl);
  return row;
}

function addToPlaylistButton(dedupeKey) {
  const editable = playlists.filter((playlist) => playlist.can_edit);
  const wrap = document.createElement("div");
  wrap.className = "playlist-add-menu";
  const button = document.createElement("button");
  button.className = "secondary compact playlist-more-button";
  button.type = "button";
  setPlaylistButtonContent(button);
  button.title = "Add to playlist";
  button.setAttribute("aria-label", "Add to playlist");
  if (editable.length === 0) {
    button.disabled = true;
    wrap.append(button);
    return wrap;
  }
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "playlist-add-options";
  menu.hidden = true;
  for (const playlist of editable) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "playlist-add-option";
    item.textContent = playlist.name;
    item.addEventListener("click", async () => {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      await api(`/api/playlists/${playlist.id}/items`, {
        method: "POST",
        body: JSON.stringify({dedupe_key: dedupeKey}),
      });
      await loadPlaylists(playlist.id);
    });
    menu.append(item);
  }
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    closePlaylistAddMenus(wrap);
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  });
  wrap.append(button, menu);
  return wrap;
}

function setPlaylistButtonContent(button) {
  const icon = document.createElement("span");
  icon.className = "playlist-add-icon";
  icon.textContent = "+";
  const label = document.createElement("span");
  label.className = "playlist-add-label";
  label.textContent = "Playlist";
  button.replaceChildren(icon, label);
}

function closePlaylistAddMenus(except = null) {
  document.querySelectorAll(".playlist-add-menu").forEach((wrap) => {
    if (wrap === except) return;
    const menu = wrap.querySelector(".playlist-add-options");
    const button = wrap.querySelector("button");
    if (menu) menu.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  });
}

function renderSubtitle(element, subtitleText, requestedBy = "") {
  element.replaceChildren();
  if (subtitleText) {
    const context = document.createElement("span");
    context.className = "track-context";
    context.textContent = subtitleText;
    element.append(context);
  }
  if (!requestedBy) {
    return;
  }
  if (subtitleText) {
    element.append(document.createTextNode(" - Queued by "));
  } else {
    element.append(document.createTextNode("Queued by "));
  }
  const requester = document.createElement("span");
  requester.className = "requester";
  requester.textContent = requestedBy;
  element.append(requester);
}
