// Command button rendering
export function commandButton(text, body) {
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

export function commandIcon(action) {
  if (action === "queue_add") return "\u2261+";
  if (action === "play_now" || action === "play") return "\u25b6";
  return "";
}

export function trashButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "secondary compact icon-only trash-button";
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(document.createElement("span"));
  button.addEventListener("click", onClick);
  return button;
}

export function trackActionGroup(commandSpecs, dedupeKey, extraButtons = []) {
  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(...commandSpecs.map(([text, body]) => commandButton(text, body)));
  if (dedupeKey) {
    const btn = window.__addToPlaylistButton?.(dedupeKey);
    if (btn) actions.append(btn);
  }
  actions.append(...extraButtons);
  window.__updateRowActionLayout?.(actions);
  return actions;
}

export function standardTrackCommands(dedupeKey) {
  if (!dedupeKey) return [];
  return [
    ["Queue", { action: "queue_add", dedupe_key: dedupeKey }],
    ["Play", { action: "play_now", dedupe_key: dedupeKey }],
  ];
}

export function command(body) {
  // This is a placeholder - the actual command function is injected via actions
  return window.__queueCommand?.(body) || Promise.resolve();
}

export function canRunCommand(action) {
  // This is a placeholder - the actual permission check is injected via actions
  return window.__canRunCommand?.(action) ?? false;
}

export function hasRoomPermission(permission) {
  // Placeholder - injected via actions
  return window.__hasRoomPermission?.(permission) ?? false;
}