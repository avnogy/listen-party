// Admin configuration form and room editor.
import {api, setStatus} from "/assets/shared/api-module.js";
import {formatRate, formatScanTime, shortPath} from "/assets/admin/admin-format.js";
import {
  addBannedIPButton, addMusicDirButton, addRoomButton, adminState, configAddr,
  configBannedIPs, configForm, configKeycloakClientID, configKeycloakClientSecret,
  configKeycloakDisplayName, configKeycloakEnabled, configKeycloakIssuer,
  configMusicDirs, configSaveButton, configScanWorkers, configStatus, minimumSaveFeedbackMS,
  rescanButton, rescanStatus, roomsList, scanStatus,
} from "/assets/admin/admin-context.js";

let {
  scanStatusTimer, saveFeedbackTimer, roomCounter, configRevision,
} = adminState;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetSaveButtonAfterDelay() {
  clearTimeout(saveFeedbackTimer);
  saveFeedbackTimer = setTimeout(() => {
    configSaveButton.textContent = "Save";
    configSaveButton.dataset.state = "";
  }, 1400);
}

function renderConfig(cfg) {
  configRevision = cfg.revision || 1;
  const auth = cfg.auth?.pocketbase || {};
  const keycloak = auth.keycloak || {};
  configAddr.value = cfg.addr || "";
  renderMusicDirs(cfg.music_dirs || []);
  renderBannedIPs(cfg.banned_ips || []);
  configScanWorkers.value = cfg.scan_workers || 16;
  configKeycloakEnabled.checked = Boolean(keycloak.enabled);
  configKeycloakIssuer.value = keycloak.issuer_url || "";
  configKeycloakClientID.value = keycloak.client_id || "";
  configKeycloakClientSecret.value = keycloak.client_secret || "";
  configKeycloakDisplayName.value = keycloak.display_name || "Keycloak";
  renderRooms(cfg.rooms || [{
    id: "main",
    name: "Public Room",
    grants: {everyone: ["queue_add", "queue_manage", "playback_control"]},
  }]);
}

function readConfigForm() {
  return {
    revision: configRevision,
    addr: configAddr.value.trim(),
    music_dirs: readMusicDirs(),
    banned_ips: readBannedIPs(),
    scan_workers: Math.max(1, Math.min(256, Math.floor(Number(configScanWorkers.value) || 16))),
    rooms: readRooms(),
    auth: {
      pocketbase: {
        keycloak: {
          enabled: configKeycloakEnabled.checked,
          issuer_url: configKeycloakIssuer.value.trim(),
          client_id: configKeycloakClientID.value.trim(),
          client_secret: configKeycloakClientSecret.value,
          display_name: configKeycloakDisplayName.value.trim() || "Keycloak",
        },
      },
    },
  };
}

function renderMusicDirs(paths) {
  const rows = paths.length > 0 ? paths : [""];
  configMusicDirs.replaceChildren(...rows.map(renderMusicDirItem));
  updateRemoveButtons(configMusicDirs, ".list-editor-remove");
}

function renderMusicDirItem(path) {
  const row = renderListItem(path, "music-dir-input", "/path/to/music", "Music directory");
  row.classList.add("music-dir-item");
  const rescan = document.createElement("button");
  rescan.className = "secondary compact path-rescan";
  rescan.type = "button";
  rescan.textContent = "Rescan";
  rescan.addEventListener("click", async () => {
    await rescanMusicDir(row.querySelector(".music-dir-input").value.trim(), rescan);
  });
  row.insertBefore(rescan, row.lastElementChild);
  return row;
}

function renderBannedIPs(ips) {
  const rows = ips.length > 0 ? ips : [""];
  configBannedIPs.replaceChildren(...rows.map((ip) => renderListItem(ip, "banned-ip-input", "192.168.1.50", "Banned IP address")));
  updateRemoveButtons(configBannedIPs, ".list-editor-remove");
}

function renderListItem(value, inputClass, placeholder, ariaLabel) {
  const row = document.createElement("div");
  row.className = "list-editor-item";

  const input = document.createElement("input");
  input.className = inputClass;
  input.value = value;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", ariaLabel);

  const remove = document.createElement("button");
  remove.className = "secondary compact icon-only trash-button list-editor-remove";
  remove.type = "button";
  remove.title = "Remove";
  remove.setAttribute("aria-label", "Remove");
  remove.append(document.createElement("span"));
  remove.addEventListener("click", () => {
    const list = row.parentElement;
    row.remove();
    updateRemoveButtons(list, ".list-editor-remove");
  });

  row.append(input, remove);
  return row;
}

function readMusicDirs() {
  return [...configMusicDirs.querySelectorAll(".music-dir-input")].map((input) => input.value.trim()).filter(Boolean);
}

function readBannedIPs() {
  return [...configBannedIPs.querySelectorAll(".banned-ip-input")].map((input) => input.value.trim()).filter(Boolean);
}

function updateRemoveButtons(container, selector) {
  const buttons = container.querySelectorAll(selector);
  buttons.forEach((button) => { button.disabled = buttons.length <= 1; });
}

function listEditor(title, inputClass, values, placeholder) {
  const editor = document.createElement("div");
  editor.className = "list-editor room-list-editor";

  const head = document.createElement("div");
  head.className = "list-editor-head";
  const label = document.createElement("span");
  label.textContent = title;
  const add = document.createElement("button");
  add.className = "secondary compact";
  add.type = "button";
  add.textContent = "Add";
  head.append(label, add);

  const list = document.createElement("div");
  list.className = "list-editor-items";
  const rows = values.length > 0 ? values : [""];
  list.replaceChildren(...rows.map((value) => renderListItem(value, inputClass, placeholder, title)));

  add.addEventListener("click", () => {
    const row = renderListItem("", inputClass, placeholder, title);
    list.append(row);
    updateRemoveButtons(list, ".list-editor-remove");
    row.querySelector(`.${inputClass}`).focus();
  });

  editor.append(head, list);
  updateRemoveButtons(list, ".list-editor-remove");
  return editor;
}

function renderRooms(rooms) {
  roomsList.replaceChildren(...rooms.map(renderRoomRow));
  updateRemoveButtons(roomsList, ".room-remove");
}

function renderRoomRow(room = {}) {
  const row = document.createElement("div");
  row.className = "room-row";
  row.roomGrants = cloneGrants(room.grants || {});
  const fields = document.createElement("div");
  fields.className = "room-fields";
  const main = document.createElement("div");
  main.className = "room-main-row";
  const access = document.createElement("div");
  access.className = "room-access-row";

  const id = inputField("ID", "room-id", room.id || `room-${roomCounter++}`);
  const name = inputField("Name", "room-name", room.name || "New Room");

  const remove = document.createElement("button");
  remove.className = "secondary compact icon-only trash-button room-remove";
  remove.type = "button";
  remove.title = "Remove room";
  remove.setAttribute("aria-label", "Remove room");
  remove.append(document.createElement("span"));
  remove.addEventListener("click", () => {
    row.remove();
    updateRemoveButtons(roomsList, ".room-remove");
  });

  main.append(id, name);
  access.append(listEditor("Room administrator groups", "room-admin-group", room.admin_groups || [], "Group"));
  fields.append(main, access);
  row.append(fields, remove);
  return row;
}

function inputField(labelText, className, value) {
  const label = document.createElement("label");
  label.className = "room-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.className = className;
  input.value = value;
  input.autocomplete = "off";
  label.append(span, input);
  return label;
}

function readRooms() {
  return [...roomsList.querySelectorAll(".room-row")].map((row) => ({
    id: row.querySelector(".room-id").value.trim(),
    name: row.querySelector(".room-name").value.trim(),
    admin_groups: [...row.querySelectorAll(".room-admin-group")].map((input) => input.value.trim()).filter(Boolean),
    grants: cloneGrants(row.roomGrants),
  }));
}

function cloneGrants(grants) {
  return Object.fromEntries(Object.entries(grants || {}).map(([group, permissions]) => [group, [...permissions]]));
}

async function loadConfig() {
  setStatus(configStatus, "Loading...", "working");
  try {
    renderConfig(await api("/api/admin/config"));
    setStatus(configStatus, "Loaded", "ok");
  } catch (err) {
    setStatus(configStatus, "Could not load config", "error");
    console.error(err);
  }
}

function setRescanStatus(message, kind = "") {
  setStatus(rescanStatus, message, kind);
}

function renderScanStatus(scan) {
  if (!scan) {
    setStatus(scanStatus, "");
    return false;
  }
  if (scan.scanning) {
    const roots = scan.roots || [];
    const scope = roots.length === 1 ? `Scanning ${shortPath(roots[0])}` : `Scanning ${roots.length || 0} folders`;
    setStatus(scanStatus, `${scope}: ${scan.mp3_seen || 0} seen, ${scan.indexed || 0} indexed, ${scan.unchanged || 0} unchanged, ${formatRate(scan.recent_tracks_per_sec)} recent`, "working");
    return true;
  }
  const base = formatScanTime(scan.last_completed);
  setStatus(scanStatus, scan.last_error ? `${base}; last scan failed` : base, scan.last_error ? "error" : "ok");
  return false;
}

async function loadLibraryStatus() {
  clearTimeout(scanStatusTimer);
  try {
    const info = await api("/api/library");
    if (renderScanStatus(info.scan)) {
      scanStatusTimer = setTimeout(() => {
        loadLibraryStatus().catch(console.error);
      }, 2000);
    }
  } catch (err) {
    setStatus(scanStatus, "Scan status unavailable", "error");
    console.error(err);
  }
}

configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (configSaveButton.disabled) return;
  clearTimeout(saveFeedbackTimer);
  configSaveButton.disabled = true;
  configSaveButton.textContent = "Saving...";
  configSaveButton.dataset.state = "working";
  setStatus(configStatus, "Saving...", "working");
  try {
    const saveRequest = api("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(readConfigForm()),
    }).then((value) => ({value}), (error) => ({error}));
    const [result] = await Promise.all([saveRequest, delay(minimumSaveFeedbackMS)]);
    if (result.error) throw result.error;
    renderConfig(result.value);
    setStatus(configStatus, "Saved", "ok");
    configSaveButton.textContent = "Saved";
    configSaveButton.dataset.state = "saved";
  } catch (err) {
    setStatus(configStatus, (err.message || "Save failed").trim(), "error");
    configSaveButton.textContent = "Save failed";
    configSaveButton.dataset.state = "error";
    console.error(err);
  } finally {
    configSaveButton.disabled = false;
    resetSaveButtonAfterDelay();
  }
});

addMusicDirButton.addEventListener("click", () => {
  const row = renderMusicDirItem("");
  configMusicDirs.append(row);
  updateRemoveButtons(configMusicDirs, ".list-editor-remove");
  row.querySelector(".music-dir-input").focus();
});

addBannedIPButton.addEventListener("click", () => {
  const row = renderListItem("", "banned-ip-input", "192.168.1.50", "Banned IP address");
  configBannedIPs.append(row);
  updateRemoveButtons(configBannedIPs, ".list-editor-remove");
  row.querySelector(".banned-ip-input").focus();
});

addRoomButton.addEventListener("click", () => {
  roomsList.append(renderRoomRow());
  updateRemoveButtons(roomsList, ".room-remove");
});

rescanButton.addEventListener("click", async () => {
  rescanButton.disabled = true;
  setRescanStatus("Rescanning...", "working");
  try {
    const res = await fetch("/api/admin/rescan", {method: "POST"});
    if (res.status === 409) {
      setRescanStatus("Scan already in progress", "working");
      await loadLibraryStatus();
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    setRescanStatus("Library rescanned", "ok");
    await loadLibraryStatus();
  } catch (err) {
    setRescanStatus("Rescan failed", "error");
    console.error(err);
  } finally {
    rescanButton.disabled = false;
  }
});

async function rescanMusicDir(path, button) {
  if (!path) {
    setRescanStatus("Choose a configured path first", "error");
    return;
  }
  button.disabled = true;
  setRescanStatus("Rescanning folder...", "working");
  try {
    const res = await fetch("/api/admin/rescan-dir", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({music_dir: path}),
    });
    if (res.status === 409) {
      setRescanStatus("Scan already in progress", "working");
      await loadLibraryStatus();
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    setRescanStatus("Folder rescanned", "ok");
    await loadLibraryStatus();
  } catch (err) {
    setRescanStatus("Folder rescan failed", "error");
    console.error(err);
  } finally {
    button.disabled = false;
  }
}

loadConfig();
loadLibraryStatus();
