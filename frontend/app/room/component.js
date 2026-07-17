// Room component logic
import { api } from "../../core/api/client.js";
import { roomAPI } from "../../core/api/endpoints.js";
import { storageGet, storageSet } from "../../core/store/persistence.js";

const PERMISSIONS = [
  ["queue_add", "Add tracks to the queue"],
  ["queue_manage", "Manage queued tracks"],
  ["playback_control", "Control playback"],
  ["volume_control", "Control room volume"],
];

export function roomGrantRow(group, permissions = [], builtIn = false) {
  const row = document.createElement("div");
  row.className = "room-settings-grant";
  const head = document.createElement("div");
  head.className = "room-settings-grant-head";
  const groupWrap = document.createElement("label");
  groupWrap.className = "room-settings-group-field";
  const groupLabel = document.createElement("span");
  groupLabel.textContent = builtIn ? "Default access" : "PocketBase group";
  const input = document.createElement("input");
  input.className = "room-settings-group";
  input.value = builtIn ? "Everyone" : group;
  input.dataset.group = builtIn ? "everyone" : "";
  input.placeholder = "PocketBase group";
  input.readOnly = builtIn;
  groupWrap.append(groupLabel, input);
  head.append(groupWrap);
  if (!builtIn) {
    const remove = document.createElement("button");
    remove.className = "secondary compact room-settings-remove";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => row.remove());
    head.append(remove);
  }
  const permissionList = document.createElement("div");
  permissionList.className = "room-settings-permissions";
  for (const [value, labelText] of PERMISSIONS) {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.permission = value;
    checkbox.checked = permissions.includes(value);
    label.classList.toggle("checked", checkbox.checked);
    checkbox.addEventListener("change", () => label.classList.toggle("checked", checkbox.checked));
    const text = document.createElement("span");
    text.className = "permission-text";
    text.textContent = labelText;
    label.append(checkbox, text);
    permissionList.append(label);
  }
  row.append(head, permissionList);
  return row;
}

export function renderRoomSettings(grants, container) {
  const entries = Object.entries(grants || {}).filter(([group]) => group !== "everyone");
  const list = document.createElement("div");
  list.className = "room-settings-grants";
  list.append(
    roomGrantRow("everyone", grants?.everyone || [], true),
    ...entries.map(([group, permissions]) => roomGrantRow(group, permissions))
  );
  const add = document.createElement("button");
  add.className = "secondary compact room-settings-add";
  add.type = "button";
  add.textContent = "Add group";
  add.addEventListener("click", () => {
    const row = roomGrantRow("", []);
    list.append(row);
    row.querySelector("input").focus();
  });
  container.replaceChildren(list, add);
}

export function readRoomSettingsGrants(container) {
  const grants = {};
  for (const row of container.querySelectorAll(".room-settings-grant")) {
    const input = row.querySelector(".room-settings-group");
    const group = (input.dataset.group || input.value).trim();
    if (!group) continue;
    const permissions = [...row.querySelectorAll("[data-permission]:checked")].map((cb) => cb.dataset.permission);
    if (permissions.length) grants[group] = [...new Set(permissions)];
  }
  return grants;
}

export async function loadRoomSettings(api, roomAPI, currentRoomId, container, statusEl) {
  statusEl.textContent = "Loading...";
  const settings = await api(roomAPI(currentRoomId, "/api/admin"));
  renderRoomSettings(settings.grants || {}, container);
  statusEl.textContent = "";
}

export async function loadLibraryStatus(api, libraryStatus) {
  try {
    const info = await api("/api/library");
    libraryStatus.textContent = `${info.track_count} tracks indexed`;
  } catch (err) {
    libraryStatus.textContent = "Library status unavailable";
    console.error(err);
  }
}

export function setRailMode(mode, ui, store, { load = true, persist = true, loadPlaylistsFn } = {}) {
  const playlistsActive = mode === "playlists";
  const libraryActive = !playlistsActive;
  if (persist) storageSet("listen-party.railMode", mode);
  if (ui.libraryTab) ui.libraryTab.classList.toggle("active", libraryActive);
  if (ui.playlistsTab) ui.playlistsTab.classList.toggle("active", playlistsActive);
  if (ui.libraryViews) ui.libraryViews.forEach((el) => (el.hidden = !libraryActive));
  if (ui.playlistsView) ui.playlistsView.hidden = !playlistsActive;
  if (playlistsActive && load && loadPlaylistsFn) {
    loadPlaylistsFn(store.getState().selectedPlaylistId).catch(console.error);
  }
}

export function closeRoomSettings(ui) {
  if (ui.roomSettingsView) ui.roomSettingsView.hidden = true;
  if (ui.libraryPanel) ui.libraryPanel.hidden = false;
  if (ui.roomSettingsButton) ui.roomSettingsButton.setAttribute("aria-expanded", "false");
}

export function toggleRoomSettings(ui, store, actions) {
  if (ui.roomSettingsView?.hidden) {
    if (!store.getState().canAdministerCurrentRoom) return;
    ui.libraryPanel.hidden = true;
    ui.roomSettingsView.hidden = false;
    ui.roomSettingsButton.setAttribute("aria-expanded", "true");
    loadRoomSettings(actions.api, actions.roomAPI, store.getState().currentRoomId, ui.roomSettingsGrants, ui.roomSettingsStatus).catch((err) => {
      ui.roomSettingsStatus.textContent = err.message || "Could not load room settings";
    });
  } else {
    closeRoomSettings(ui);
  }
}