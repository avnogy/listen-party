// Playlist add menu
import { storageGet, storageSet } from "../../../core/store/persistence.js";

export function addToPlaylistButton(dedupeKey, store, api, loadPlaylists) {
  const editable = store.getState().playlists.filter((playlist) => playlist.can_edit);
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
        body: JSON.stringify({ dedupe_key: dedupeKey }),
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

export function setPlaylistButtonContent(button) {
  const icon = document.createElement("span");
  icon.className = "playlist-add-icon";
  icon.textContent = "+";
  const label = document.createElement("span");
  label.className = "playlist-add-label";
  label.textContent = "Playlist";
  button.replaceChildren(icon, label);
}

export function closePlaylistAddMenus(except = null) {
  document.querySelectorAll(".playlist-add-menu").forEach((wrap) => {
    if (wrap === except) return;
    const menu = wrap.querySelector(".playlist-add-options");
    const button = wrap.querySelector("button");
    if (menu) menu.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  });
}