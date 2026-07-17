// Admin bootstrap
import { createStore } from "../core/store/createStore.js";
import { initialAdminState } from "./store/state.js";
import { storageGet, storageSet } from "../core/store/persistence.js";
import { api } from "../core/api/client.js";
import { formatRate, formatScanTime, shortPath, setStatus } from "../core/util.js";
import { EventSourceManager } from "../core/events/EventSourceManager.js";
import { renderListItem, updateRemoveButtons, inputField, listEditor, cloneGrants } from "./components/ListEditors.js";

// UI references
const ui = {
  configStatus: document.getElementById("configStatus"),
  configForm: document.getElementById("configForm"),
  configSaveButton: document.getElementById("configSave"),
  configAddr: document.getElementById("configAddr"),
  configMusicDirs: document.getElementById("configMusicDirs"),
  configBannedIPs: document.getElementById("configBannedIPs"),
  configScanWorkers: document.getElementById("configScanWorkers"),
  configKeycloakEnabled: document.getElementById("configKeycloakEnabled"),
  configKeycloakIssuer: document.getElementById("configKeycloakIssuer"),
  configKeycloakClientID: document.getElementById("configKeycloakClientID"),
  configKeycloakClientSecret: document.getElementById("configKeycloakClientSecret"),
  configKeycloakDisplayName: document.getElementById("configKeycloakDisplayName"),
  addMusicDirButton: document.getElementById("addMusicDir"),
  addBannedIPButton: document.getElementById("addBannedIP"),
  addRoomButton: document.getElementById("addRoom"),
  roomsList: document.getElementById("roomsList"),
  rescanButton: document.getElementById("rescan"),
  rescanStatus: document.getElementById("rescanStatus"),
  scanStatus: document.getElementById("scanStatus"),
};

const store = createStore(initialAdminState);
export { store };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readConfigForm() {
  return {
    revision: store.getState().configRevision,
    addr: ui.configAddr.value.trim(),
    music_dirs: [...ui.configMusicDirs.querySelectorAll(".music-dir-input")].map((input) => input.value.trim()).filter(Boolean),
    banned_ips: [...ui.configBannedIPs.querySelectorAll(".banned-ip-input")].map((input) => input.value.trim()).filter(Boolean),
    scan_workers: Math.max(1, Math.min(256, Math.floor(Number(ui.configScanWorkers.value) || 16))),
    rooms: [...ui.roomsList.querySelectorAll(".room-row")].map((row) => ({
      id: row.querySelector(".room-id").value.trim(),
      name: row.querySelector(".room-name").value.trim(),
      admin_groups: [...row.querySelectorAll(".room-admin-group")].map((input) => input.value.trim()).filter(Boolean),
      grants: cloneGrants(row.roomGrants),
    })),
    auth: {
      pocketbase: {
        keycloak: {
          enabled: ui.configKeycloakEnabled.checked,
          issuer_url: ui.configKeycloakIssuer.value.trim(),
          client_id: ui.configKeycloakClientID.value.trim(),
          client_secret: ui.configKeycloakClientSecret.value,
          display_name: ui.configKeycloakDisplayName.value.trim() || "Keycloak",
        },
      },
    },
  };
}

function renderConfig(cfg) {
  store.setState({ configRevision: cfg.revision || 1 });
  ui.configAddr.value = cfg.addr || "";
  renderMusicDirs(cfg.music_dirs || []);
  renderBannedIPs(cfg.banned_ips || []);
  ui.configScanWorkers.value = cfg.scan_workers || 16;
  const auth = cfg.auth?.pocketbase || {};
  const keycloak = auth.keycloak || {};
  ui.configKeycloakEnabled.checked = Boolean(keycloak.enabled);
  ui.configKeycloakIssuer.value = keycloak.issuer_url || "";
  ui.configKeycloakClientID.value = keycloak.client_id || "";
  ui.configKeycloakClientSecret.value = keycloak.client_secret || "";
  ui.configKeycloakDisplayName.value = keycloak.display_name || "Keycloak";
  renderRooms(cfg.rooms || [
    { id: "main", name: "Public Room", grants: { everyone: ["queue_add", "queue_manage", "playback_control"] } },
  ]);
}

function renderMusicDirs(paths) {
  const rows = paths.length > 0 ? paths : [""];
  ui.configMusicDirs.replaceChildren(...rows.map(renderMusicDirItem));
  updateRemoveButtons(ui.configMusicDirs, ".list-editor-remove");
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
  ui.configBannedIPs.replaceChildren(...rows.map((ip) => renderListItem(ip, "banned-ip-input", "192.168.1.50", "Banned IP address")));
  updateRemoveButtons(ui.configBannedIPs, ".list-editor-remove");
}

function renderRooms(rooms) {
  ui.roomsList.replaceChildren(...rooms.map(renderRoomRow));
  updateRemoveButtons(ui.roomsList, ".room-remove");
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
  const id = inputField("ID", "room-id", room.id || `room-${store.getState().roomCounter++}`);
  const name = inputField("Name", "room-name", room.name || "New Room");
  const remove = document.createElement("button");
  remove.className = "secondary compact icon-only trash-button room-remove";
  remove.type = "button";
  remove.title = "Remove room";
  remove.setAttribute("aria-label", "Remove room");
  remove.append(document.createElement("span"));
  remove.addEventListener("click", () => {
    row.remove();
    updateRemoveButtons(ui.roomsList, ".room-remove");
  });
  main.append(id, name);
  access.append(listEditor("Room administrator groups", "room-admin-group", room.admin_groups || [], "Group"));
  fields.append(main, access);
  row.append(fields, remove);
  return row;
}

function setRescanStatus(message, kind = "") {
  setStatus(ui.rescanStatus, message, kind);
}

function renderScanStatus(scan) {
  if (!scan) {
    setStatus(ui.scanStatus, "");
    return false;
  }
  if (scan.scanning) {
    const roots = scan.roots || [];
    const scope = roots.length === 1 ? `Scanning ${shortPath(roots[0])}` : `Scanning ${roots.length || 0} folders`;
    setStatus(ui.scanStatus, `${scope}: ${scan.mp3_seen || 0} seen, ${scan.indexed || 0} indexed, ${scan.unchanged || 0} unchanged, ${formatRate(scan.recent_tracks_per_sec)} recent`, "working");
    return true;
  }
  const base = formatScanTime(scan.last_completed);
  setStatus(ui.scanStatus, scan.last_error ? `${base}; last scan failed` : base, scan.last_error ? "error" : "ok");
  return false;
}

async function loadLibraryStatus() {
  clearTimeout(store.getState().scanStatusTimer);
  try {
    const info = await api("/api/library");
    if (renderScanStatus(info.scan)) {
      const timer = setTimeout(() => loadLibraryStatus().catch(console.error), 2000);
      store.setState({ scanStatusTimer: timer });
    }
  } catch (err) {
    setStatus(ui.scanStatus, "Scan status unavailable", "error");
    console.error(err);
  }
}

async function loadConfig() {
  setStatus(ui.configStatus, "Loading...", "working");
  try {
    renderConfig(await api("/api/admin/config"));
    setStatus(ui.configStatus, "Loaded", "ok");
  } catch (err) {
    setStatus(ui.configStatus, "Could not load config", "error");
    console.error(err);
  }
}

function resetSaveButtonAfterDelay() {
  clearTimeout(store.getState().saveFeedbackTimer);
  const timer = setTimeout(() => {
    if (ui.configSaveButton) {
      ui.configSaveButton.textContent = "Save";
      ui.configSaveButton.dataset.state = "";
    }
  }, 1400);
  store.setState({ saveFeedbackTimer: timer });
}

ui.configForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ui.configSaveButton?.disabled) return;
  clearTimeout(store.getState().saveFeedbackTimer);
  ui.configSaveButton.disabled = true;
  ui.configSaveButton.textContent = "Saving...";
  ui.configSaveButton.dataset.state = "working";
  setStatus(ui.configStatus, "Saving...", "working");
  try {
    const saveRequest = api("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(readConfigForm()),
    }).then((value) => ({ value }), (error) => ({ error }));
    const [result] = await Promise.all([saveRequest, delay(350)]);
    if (result.error) throw result.error;
    renderConfig(result.value);
    setStatus(ui.configStatus, "Saved", "ok");
    ui.configSaveButton.textContent = "Saved";
    ui.configSaveButton.dataset.state = "saved";
  } catch (err) {
    setStatus(ui.configStatus, (err.message || "Save failed").trim(), "error");
    ui.configSaveButton.textContent = "Save failed";
    ui.configSaveButton.dataset.state = "error";
    console.error(err);
  } finally {
    ui.configSaveButton.disabled = false;
    resetSaveButtonAfterDelay();
  }
});

ui.addMusicDirButton.addEventListener("click", () => {
  const row = renderMusicDirItem("");
  ui.configMusicDirs.append(row);
  updateRemoveButtons(ui.configMusicDirs, ".list-editor-remove");
  row.querySelector(".music-dir-input").focus();
});

ui.addBannedIPButton.addEventListener("click", () => {
  const row = renderListItem("", "banned-ip-input", "192.168.1.50", "Banned IP address");
  ui.configBannedIPs.append(row);
  updateRemoveButtons(ui.configBannedIPs, ".list-editor-remove");
  row.querySelector(".banned-ip-input").focus();
});

ui.addRoomButton.addEventListener("click", () => {
  ui.roomsList.append(renderRoomRow());
  updateRemoveButtons(ui.roomsList, ".room-remove");
});

ui.rescanButton.addEventListener("click", async () => {
  ui.rescanButton.disabled = true;
  setRescanStatus("Rescanning...", "working");
  try {
    const res = await fetch("/api/admin/rescan", { method: "POST" });
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
    ui.rescanButton.disabled = false;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ music_dir: path }),
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