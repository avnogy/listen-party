// Admin config form component
import { renderListItem, updateRemoveButtons, inputField, listEditor, cloneGrants } from "./ListEditors.js";

export function createConfigFormComponent(ui, store, actions) {
  function renderConfig(cfg) {
    store.setState({ configRevision: cfg.revision || 1 });
    if (ui.configAddr) ui.configAddr.value = cfg.addr || "";
    renderMusicDirs(cfg.music_dirs || []);
    renderBannedIPs(cfg.banned_ips || []);
    if (ui.configScanWorkers) ui.configScanWorkers.value = cfg.scan_workers || 16;

    const auth = cfg.auth?.pocketbase || {};
    const keycloak = auth.keycloak || {};
    if (ui.configKeycloakEnabled) ui.configKeycloakEnabled.checked = Boolean(keycloak.enabled);
    if (ui.configKeycloakIssuer) ui.configKeycloakIssuer.value = keycloak.issuer_url || "";
    if (ui.configKeycloakClientID) ui.configKeycloakClientID.value = keycloak.client_id || "";
    if (ui.configKeycloakClientSecret) ui.configKeycloakClientSecret.value = keycloak.client_secret || "";
    if (ui.configKeycloakDisplayName) ui.configKeycloakDisplayName.value = keycloak.display_name || "Keycloak";

    renderRooms(cfg.rooms || [{
      id: "main",
      name: "Public Room",
      grants: { everyone: ["queue_add", "queue_manage", "playback_control"] },
    }]);
  }

  function readConfigForm() {
    return {
      revision: store.getState().configRevision,
      addr: ui.configAddr?.value?.trim() || "",
      music_dirs: readMusicDirs(),
      banned_ips: readBannedIPs(),
      scan_workers: Math.max(1, Math.min(256, Math.floor(Number(ui.configScanWorkers?.value) || 16))),
      rooms: readRooms(),
      auth: {
        pocketbase: {
          keycloak: {
            enabled: ui.configKeycloakEnabled?.checked || false,
            issuer_url: ui.configKeycloakIssuer?.value?.trim() || "",
            client_id: ui.configKeycloakClientID?.value?.trim() || "",
            client_secret: ui.configKeycloakClientSecret?.value || "",
            display_name: ui.configKeycloakDisplayName?.value?.trim() || "Keycloak",
          },
        },
      },
    };
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
      await actions.rescanMusicDir(row.querySelector(".music-dir-input").value.trim(), rescan);
    });
    row.insertBefore(rescan, row.lastElementChild);
    return row;
  }

  function renderBannedIPs(ips) {
    const rows = ips.length > 0 ? ips : [""];
    ui.configBannedIPs.replaceChildren(...rows.map((ip) => renderListItem(ip, "banned-ip-input", "192.168.1.50", "Banned IP address")));
    updateRemoveButtons(ui.configBannedIPs, ".list-editor-remove");
  }

  function readMusicDirs() {
    return [...document.querySelectorAll(".music-dir-input")].map((input) => input.value.trim()).filter(Boolean);
  }

  function readBannedIPs() {
    return [...document.querySelectorAll(".banned-ip-input")].map((input) => input.value.trim()).filter(Boolean);
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

  function readRooms() {
    return [...document.querySelectorAll(".room-row")].map((row) => ({
      id: row.querySelector(".room-id").value.trim(),
      name: row.querySelector(".room-name").value.trim(),
      admin_groups: [...row.querySelectorAll(".room-admin-group")].map((input) => input.value.trim()).filter(Boolean),
      grants: cloneGrants(row.roomGrants),
    }));
  }

  function init() {
    ui.addMusicDirButton?.addEventListener("click", () => {
      const row = renderMusicDirItem("");
      ui.configMusicDirs.append(row);
      updateRemoveButtons(ui.configMusicDirs, ".list-editor-remove");
      row.querySelector(".music-dir-input").focus();
    });

    ui.addBannedIPButton?.addEventListener("click", () => {
      const row = renderListItem("", "banned-ip-input", "192.168.1.50", "Banned IP address");
      ui.configBannedIPs.append(row);
      updateRemoveButtons(ui.configBannedIPs, ".list-editor-remove");
      row.querySelector(".banned-ip-input").focus();
    });

    ui.addRoomButton?.addEventListener("click", () => {
      ui.roomsList.append(renderRoomRow());
      updateRemoveButtons(ui.roomsList, ".room-remove");
    });

    ui.configForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (ui.configSaveButton?.disabled) return;
      clearTimeout(store.getState().saveFeedbackTimer);
      ui.configSaveButton.disabled = true;
      ui.configSaveButton.textContent = "Saving...";
      ui.configSaveButton.dataset.state = "working";
      actions.setStatus(ui.configStatus, "Saving...", "working");
      try {
        const saveRequest = actions.api("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify(readConfigForm()),
        }).then((value) => ({ value }), (error) => ({ error }));
        const [result] = await Promise.all([saveRequest, actions.delay(350)]);
        if (result.error) throw result.error;
        renderConfig(result.value);
        actions.setStatus(ui.configStatus, "Saved", "ok");
        ui.configSaveButton.textContent = "Saved";
        ui.configSaveButton.dataset.state = "saved";
      } catch (err) {
        actions.setStatus(ui.configStatus, (err.message || "Save failed").trim(), "error");
        ui.configSaveButton.textContent = "Save failed";
        ui.configSaveButton.dataset.state = "error";
        console.error(err);
      } finally {
        ui.configSaveButton.disabled = false;
        resetSaveButtonAfterDelay();
      }
    });
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

  return { init, renderConfig, readConfigForm };
}