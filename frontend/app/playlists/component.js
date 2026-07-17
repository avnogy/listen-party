// Playlists component
import { emptyHint, trackRow, standardTrackCommands, trackTitle, trackSubtitle, playbackRequester, trashButton } from "../queue/render/index.js";

export async function loadPlaylists(api, store, ui, selectId = store.getState().selectedPlaylistId) {
  const playlists = await api("/api/playlists");
  store.setState({ playlists });
  if (!playlists.some((p) => p.id === selectId)) {
    selectId = playlists[0]?.id || 0;
  }
  store.setState({ selectedPlaylistId: selectId });
  localStorage.setItem("listen-party.selectedPlaylist", selectId || "");
  renderPlaylists(playlists, selectId, ui, store);
  if (store.getState().selectedPlaylistId) {
    await loadPlaylistDetail(api, store, ui, store.getState().selectedPlaylistId);
  } else {
    ui.playlistDetailEl.replaceChildren(emptyHint("No playlists yet"));
  }
}

function renderPlaylists(playlists, selectedId, ui, store) {
  if (!ui.playlistSelect) return;
  ui.playlistSelect.replaceChildren(...playlists.map((playlist) => {
    const option = document.createElement("option");
    option.value = String(playlist.id);
    option.textContent = playlist.name;
    return option;
  }));
  ui.playlistSelect.hidden = playlists.length === 0;
  ui.playlistSelect.value = selectedId ? String(selectedId) : "";
  updatePlaylistActionButtons(ui, store.getState());
}

export async function loadPlaylistDetail(api, store, ui, id) {
  const playlist = await api(`/api/playlists/${id}`);
  renderPlaylistDetail(playlist, ui, store.getState().playlists, store);
}

export function renderPlaylistDetail(playlist, ui, allPlaylists, store) {
  const items = playlist.items || [];
  const list = document.createElement("div");
  list.className = "playlist-items";
  list.replaceChildren(...(items.length ? items.map((item) => renderPlaylistItem(playlist, item, ui, store)) : [emptyHint("No tracks in this playlist")]));
  ui.playlistDetailEl.replaceChildren(list);
  updatePlaylistActionButtons(ui, { ...store.getState(), playlists: allPlaylists.map((p) => p.id === playlist.id ? playlist : p) });
}

export function renderPlaylistItem(playlist, item, ui, store) {
  const dedupeKey = item.dedupe_key || "";
  const track = {
    dedupe_key: dedupeKey,
    title: item.title || "Unknown track",
    artist: item.artist || "",
    album: item.album || "",
  };
  const extraButtons = [];
  if (playlist.can_edit) {
    const remove = trashButton("Remove from playlist", async () => {
      const updated = await fetch(`/api/playlists/${playlist.id}/items/${item.id}`, { method: "DELETE" }).then((r) => r.json());
      renderPlaylistDetail(updated, ui, store.getState().playlists, store);
    });
    extraButtons.push(remove);
  }
  return trackRow(track, standardTrackCommands(dedupeKey), "", dedupeKey, extraButtons);
}

export function updatePlaylistActionButtons(ui, state) {
  const playlist = state.playlists.find((item) => item.id === state.selectedPlaylistId);
  if (ui.deletePlaylistButton) ui.deletePlaylistButton.hidden = !playlist?.can_edit;
  if (ui.importPlaylistFolderButton) ui.importPlaylistFolderButton.hidden = !playlist?.can_edit;
}

export async function createPlaylist(api, name) {
  return await api("/api/playlists", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deletePlaylist(api, id) {
  await api(`/api/playlists/${id}`, { method: "DELETE" });
}

export async function importPlaylistFolder(api, playlistId, files) {
  return await api(`/api/playlists/${playlistId}/import-folder`, {
    method: "POST",
    body: JSON.stringify({ files }),
  });
}