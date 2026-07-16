// Playlist loading and playlist item rendering.

async function loadPlaylists(selectID = selectedPlaylistID) {
  playlists = await api("/api/playlists");
  if (!playlists.some((playlist) => playlist.id === selectID)) {
    selectID = playlists[0]?.id || 0;
  }
  selectedPlaylistID = selectID;
  storageSet(playlistStorageKey, selectedPlaylistID || "");
  renderPlaylists();
  if (selectedPlaylistID) {
    await loadPlaylistDetail(selectedPlaylistID);
  } else {
    playlistDetailEl.replaceChildren(emptyHint("No playlists yet"));
  }
  runSearch().catch(console.error);
}

function renderPlaylists() {
  playlistSelect.replaceChildren(...playlists.map((playlist) => {
    const option = document.createElement("option");
    option.value = String(playlist.id);
    option.textContent = playlist.name;
    return option;
  }));
  playlistSelect.hidden = playlists.length === 0;
  playlistSelect.value = selectedPlaylistID ? String(selectedPlaylistID) : "";
  updatePlaylistActionButtons();
}

async function loadPlaylistDetail(id) {
  const playlist = await api(`/api/playlists/${id}`);
  renderPlaylistDetail(playlist);
}

function renderPlaylistItem(playlist, item) {
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
      const updated = await api(`/api/playlists/${playlist.id}/items/${item.id}`, {method: "DELETE"});
      renderPlaylistDetail(updated);
    });
    extraButtons.push(remove);
  }
  return trackRow(track, standardTrackCommands(dedupeKey), "", dedupeKey, extraButtons);
}

function renderPlaylistDetail(playlist) {
  const items = playlist.items || [];
  const list = document.createElement("div");
  list.className = "playlist-items";
  list.replaceChildren(...(items.length ? items.map((item) => renderPlaylistItem(playlist, item)) : [emptyHint("No tracks in this playlist")]));
  playlistDetailEl.replaceChildren(list);
  playlists = playlists.map((existing) => existing.id === playlist.id ? playlist : existing);
  updatePlaylistActionButtons();
}

function updatePlaylistActionButtons() {
  const playlist = playlists.find((item) => item.id === selectedPlaylistID);
  deletePlaylistButton.hidden = !playlist?.can_edit;
  importPlaylistFolderButton.hidden = !playlist?.can_edit;
}

function emptyHint(text, tag = "p") {
  const hint = document.createElement(tag);
  hint.className = "hint empty-state";
  hint.textContent = text;
  return hint;
}
