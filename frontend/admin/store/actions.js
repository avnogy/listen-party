// Admin async actions
import { api } from "../../core/api/client.js";

const MINIMUM_SAVE_FEEDBACK_MS = 350;

export function createAdminActions(store, deps = {}) {
  const { ui } = deps;

  return {
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    async loadConfig() {
      if (ui.configStatus) deps.setStatus(ui.configStatus, "Loading...", "working");
      try {
        const cfg = await api("/api/admin/config");
        actions.renderConfig(cfg);
        if (ui.configStatus) deps.setStatus(ui.configStatus, "Loaded", "ok");
      } catch (err) {
        if (ui.configStatus) deps.setStatus(ui.configStatus, "Could not load config", "error");
        console.error(err);
      }
    },

    renderConfig(cfg) {
      store.setState({ configRevision: cfg.revision || 1 });

      if (ui.configAddr) ui.configAddr.value = cfg.addr || "";
      actions.renderMusicDirs(cfg.music_dirs || []);
      actions.renderBannedIPs(cfg.banned_ips || []);
      if (ui.configScanWorkers) ui.configScanWorkers.value = cfg.scan_workers || 16;

      const auth = cfg.auth?.pocketbase || {};
      const keycloak = auth.keycloak || {};
      if (ui.configKeycloakEnabled) ui.configKeycloakEnabled.checked = Boolean(keycloak.enabled);
      if (ui.configKeycloakIssuer) ui.configKeycloakIssuer.value = keycloak.issuer_url || "";
      if (ui.configKeycloakClientID) ui.configKeycloakClientID.value = keycloak.client_id || "";
      if (ui.configKeycloakClientSecret) ui.configKeycloakClientSecret.value = keycloak.client_secret || "";
      if (ui.configKeycloakDisplayName) ui.configKeycloakDisplayName.value = keycloak.display_name || "Keycloak";

      actions.renderRooms(cfg.rooms || [
        { id: "main", name: "Public Room", grants: { everyone: ["queue_add", "queue_manage", "playback_control"] } },
      ]);
    },

    readConfigForm() {
      return {
        revision: store.getState().configRevision,
        addr: ui.configAddr?.value?.trim() || "",
        music_dirs: actions.readMusicDirs(),
        banned_ips: actions.readBannedIPs(),
        scan_workers: Math.max(1, Math.min(256, Math.floor(Number(ui.configScanWorkers?.value) || 16))),
        rooms: actions.readRooms(),
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
    },

    renderMusicDirs(paths) {
      const rows = paths.length > 0 ? paths : [""];
      if (ui.configMusicDirs) {
        ui.configMusicDirs.replaceChildren(...rows.map(actions.renderMusicDirItem));
        actions.updateRemoveButtons(ui.configMusicDirs, ".list-editor-remove");
      }
    },

    renderMusicDirItem(path) {
      const row = actions.renderListItem(path, "music-dir-input", "/path/to/music", "Music directory");
      row.classList.add("music-dir-item");
      const rescan = document.createElement("button");
      rescan.className = "secondary compact path-rescan";
      rescan.type = "button";
      rescan.textContent = "Rescan";
      rescan.addEventListener("click", async () => {
        const input = row.querySelector(".music-dir-input");
        await actions.rescanMusicDir(input.value.trim(), rescan);
      });
      row.insertBefore(rescan, row.lastElementChild);
      return row;
    },

    renderBannedIPs(ips) {
      const rows = ips.length > 0 ? ips : [""];
      if (ui.configBannedIPs) {
        ui.configBannedIPs.replaceChildren(...rows.map((ip) => actions.renderListItem(ip, "banned-ip-input", "192.168.1.50", "Banned IP address")));
        actions.updateRemoveButtons(ui.configBannedIPs, ".list-editor-remove");
      }
    },

    renderListItem(value, inputClass, placeholder, ariaLabel) {
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
        actions.updateRemoveButtons(list, ".list-editor-remove");
      });

      row.append(input, remove);
      return row;
    },

    readMusicDirs() {
      return [...document.querySelectorAll(".music-dir-input")].map((input) => input.value.trim()).filter(Boolean);
    },

    readBannedIPs() {
      return [...document.querySelectorAll(".banned-ip-input")].map((input) => input.value.trim()).filter(Boolean);
    },

    updateRemoveButtons(container, selector) {
      const buttons = container.querySelectorAll(selector);
      buttons.forEach((btn) => (btn.disabled = buttons.length <= 1));
    },

    listEditor(title, inputClass, values, placeholder) {
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
      list.replaceChildren(...rows.map((value) => actions.renderListItem(value, inputClass, placeholder, title)));

      add.addEventListener("click", () => {
        const row = actions.renderListItem("", inputClass, placeholder, title);
        list.append(row);
        actions.updateRemoveButtons(list, ".list-editor-remove");
        row.querySelector(`.${inputClass}`).focus();
      });

      editor.append(head, list);
      actions.updateRemoveButtons(list, ".list-editor-remove");
      return editor;
    },

    renderRooms(rooms) {
      if (ui.roomsList) {
        ui.roomsList.replaceChildren(...rooms.map(actions.renderRoomRow));
        actions.updateRemoveButtons(ui.roomsList, ".room-remove");
      }
    },

    renderRoomRow(room = {}) {
      const row = document.createElement("div");
      row.className = "room-row";
      row.roomGrants = actions.cloneGrants(room.grants || {});

      const fields = document.createElement("div");
      fields.className = "room-fields";

      const main = document.createElement("div");
      main.className = "room-main-row";

      const access = document.createElement("div");
      access.className = "room-access-row";

      const id = actions.inputField("ID", "room-id", room.id || `room-${store.getState().roomCounter++}`);
      const name = actions.inputField("Name", "room-name", room.name || "New Room");

      const remove = document.createElement("button");
      remove.className = "secondary compact icon-only trash-button room-remove";
      remove.type = "button";
      remove.title = "Remove room";
      remove.setAttribute("aria-label", "Remove room");
      remove.append(document.createElement("span"));
      remove.addEventListener("click", () => {
        row.remove();
        actions.updateRemoveButtons(ui.roomsList, ".room-remove");
      });

      main.append(id, name);
      access.append(actions.listEditor("Room administrator groups", "room-admin-group", room.admin_groups || [], "Group"));
      fields.append(main, access);
      row.append(fields, remove);
      return row;
    },

    inputField(labelText, className, value) {
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
    },

    readRooms() {
      return [...document.querySelectorAll(".room-row")].map((row) => ({
        id: row.querySelector(".room-id").value.trim(),
        name: row.querySelector(".room-name").value.trim(),
        admin_groups: [...row.querySelectorAll(".room-admin-group")].map((input) => input.value.trim()).filter(Boolean),
        grants: actions.cloneGrants(row.roomGrants),
      }));
    },

    cloneGrants(grants) {
      return Object.fromEntries(Object.entries(grants || {}).map(([group, permissions]) => [group, [...permissions]]));
    },

    resetSaveButtonAfterDelay() {
      const state = store.getState();
      clearTimeout(state.saveFeedbackTimer);
      const timer = setTimeout(() => {
        if (ui.configSaveButton) {
          ui.configSaveButton.textContent = "Save";
          ui.configSaveButton.dataset.state = "";
        }
      }, 1400);
      store.setState({ saveFeedbackTimer: timer });
    },

    async saveConfig() {
      if (ui.configSaveButton?.disabled) return;

      clearTimeout(store.getState().saveFeedbackTimer);
      if (ui.configSaveButton) {
        ui.configSaveButton.disabled = true;
        ui.configSaveButton.textContent = "Saving...";
        ui.configSaveButton.dataset.state = "working";
      }
      if (ui.configStatus) deps.setStatus(ui.configStatus, "Saving...", "working");

      try {
        const saveRequest = api("/api/admin/config", {
          method: "PUT",
          body: JSON.stringify(actions.readConfigForm()),
        }).then((value) => ({ value }), (error) => ({ error }));

        const [result] = await Promise.all([saveRequest, actions.delay(MINIMUM_SAVE_FEEDBACK_MS)]);

        if (result.error) throw result.error;

        actions.renderConfig(result.value);
        if (ui.configStatus) deps.setStatus(ui.configStatus, "Saved", "ok");
        if (ui.configSaveButton) {
          ui.configSaveButton.textContent = "Saved";
          ui.configSaveButton.dataset.state = "saved";
        }
      } catch (err) {
        if (ui.configStatus) deps.setStatus(ui.configStatus, (err.message || "Save failed").trim(), "error");
        if (ui.configSaveButton) {
          ui.configSaveButton.textContent = "Save failed";
          ui.configSaveButton.dataset.state = "error";
        }
        console.error(err);
      } finally {
        if (ui.configSaveButton) ui.configSaveButton.disabled = false;
        actions.resetSaveButtonAfterDelay();
      }
    },

    // Rescan handlers
    setRescanStatus(message, kind = "") {
      if (ui.rescanStatus) deps.setStatus(ui.rescanStatus, message, kind);
    },

    renderScanStatus(scan) {
      if (!scan) {
        if (ui.scanStatus) deps.setStatus(ui.scanStatus, "");
        return false;
      }
      if (scan.scanning) {
        const roots = scan.roots || [];
        const scope = roots.length === 1 ? `Scanning ${deps.shortPath(roots[0])}` : `Scanning ${roots.length || 0} folders`;
        deps.setStatus(ui.scanStatus, `${scope}: ${scan.mp3_seen || 0} seen, ${scan.indexed || 0} indexed, ${scan.unchanged || 0} unchanged, ${deps.formatRate(scan.recent_tracks_per_sec)} recent`, "working");
        return true;
      }
      const base = deps.formatScanTime(scan.last_completed);
      deps.setStatus(ui.scanStatus, scan.last_error ? `${base}; last scan failed` : base, scan.last_error ? "error" : "ok");
      return false;
    },

    async loadLibraryStatus() {
      const state = store.getState();
      clearTimeout(state.scanStatusTimer);
      try {
        const info = await api("/api/library");
        if (actions.renderScanStatus(info.scan)) {
          const timer = setTimeout(() => actions.loadLibraryStatus(), 2000);
          store.setState({ scanStatusTimer: timer });
        }
      } catch (err) {
        deps.setStatus(ui.scanStatus, "Scan status unavailable", "error");
        console.error(err);
      }
    },

    async rescanAll() {
      if (ui.rescanButton) ui.rescanButton.disabled = true;
      actions.setRescanStatus("Rescanning...", "working");
      try {
        const res = await fetch("/api/admin/rescan", { method: "POST" });
        if (res.status === 409) {
          actions.setRescanStatus("Scan already in progress", "working");
          await actions.loadLibraryStatus();
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        actions.setRescanStatus("Library rescanned", "ok");
        await actions.loadLibraryStatus();
      } catch (err) {
        actions.setRescanStatus("Rescan failed", "error");
        console.error(err);
      } finally {
        if (ui.rescanButton) ui.rescanButton.disabled = false;
      }
    },

    async rescanMusicDir(path, button) {
      if (!path) {
        actions.setRescanStatus("Choose a configured path first", "error");
        return;
      }
      button.disabled = true;
      actions.setRescanStatus("Rescanning folder...", "working");
      try {
        const res = await fetch("/api/admin/rescan-dir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ music_dir: path }),
        });
        if (res.status === 409) {
          actions.setRescanStatus("Scan already in progress", "working");
          await actions.loadLibraryStatus();
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        actions.setRescanStatus("Folder rescanned", "ok");
        await actions.loadLibraryStatus();
      } catch (err) {
        actions.setRescanStatus("Folder rescan failed", "error");
        console.error(err);
      } finally {
        button.disabled = false;
      }
    },
  };
}

let actions = null;

export function setAdminActions(a) {
  actions = a;
}

export function getAdminActions() {
  return actions;
}