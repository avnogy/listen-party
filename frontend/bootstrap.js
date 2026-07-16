// Page startup, navigation, and event wiring.

async function loadRooms(info = null) {
  info ||= await api("/api/session");
  currentUserEl.textContent = info.user?.display_name || info.user?.username || "Signed in";
  const rooms = info.rooms || [];
  if (!currentRoomID) {
    currentRoomID = info.default_room_id || (rooms[0] && rooms[0].id) || "main";
  }
  if (rooms.length > 0 && !rooms.some((room) => room.id === currentRoomID)) {
    currentRoomID = rooms[0].id;
  }
  roomSelect.replaceChildren(...rooms.map((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name || room.id;
    return option;
  }));
  roomSelect.value = currentRoomID;
  roomSelect.disabled = rooms.length <= 1;
  currentPermissions = new Set(info.permissions?.[currentRoomID] || []);
  if (info.disconnected?.[currentRoomID]) {
    forceLogout();
    return false;
  }
  canAdministerCurrentRoom = Boolean(info.room_administration?.[currentRoomID]);
  roomSettingsButton.hidden = !canAdministerCurrentRoom;
  if (!canAdministerCurrentRoom) closeRoomSettings();
  return true;
}

async function switchRoom(roomID, updateHistory = true) {
  if (!roomID || roomID === currentRoomID) return;
  roomSelect.disabled = true;
  try {
    const [info, state] = await Promise.all([
      api("/api/session"),
      api(`/rooms/${encodeURIComponent(roomID)}/api/state`),
    ]);
    if (!(info.rooms || []).some((room) => room.id === roomID)) {
      throw new Error("room not found");
    }

    closeEvents();
    audio.pause();
    closeRoomSettings();
    closeAutoDJSourceMenu();
    currentRoomID = roomID;
    lastState = null;
    lastStateReceivedAt = 0;
    queueDragActive = false;
    queueReorderPending = false;
    pendingQueueState = null;
    if (updateHistory) history.pushState(null, "", `/rooms/${encodeURIComponent(roomID)}`);

    if (!await loadRooms(info)) return;
    restoreVolumePreferences();
    renderState(state);
    connectEvents();
  } catch (err) {
    console.error(err);
    roomSelect.value = currentRoomID;
    history.replaceState(null, "", `/rooms/${encodeURIComponent(currentRoomID)}`);
  } finally {
    roomSelect.disabled = roomSelect.options.length <= 1;
    updateQueueSortable();
  }
}

async function runSearch() {
  const q = searchInput.value.trim();
  const field = searchField.value;
  const params = new URLSearchParams({q, field});
  const tracks = await api(`/api/search?${params}`);
  if (q !== searchInput.value.trim() || field !== searchField.value) {
    return;
  }
  resultsEl.replaceChildren(...(tracks.length ? tracks.map((track) => trackRow(track, standardTrackCommands(track.dedupe_key))) : [emptyHint("No matching tracks")]));
}

libraryTab.addEventListener("click", () => setRailMode("library"));
playlistsTab.addEventListener("click", () => setRailMode("playlists"));
roomSettingsButton.addEventListener("click", toggleRoomSettings);
closeRoomSettingsButton.addEventListener("click", closeRoomSettings);

playlistSelect.addEventListener("change", async () => {
  playlistImportStatus.textContent = "";
  selectedPlaylistID = Number(playlistSelect.value);
  if (!selectedPlaylistID) return;
  storageSet(playlistStorageKey, selectedPlaylistID);
  await loadPlaylistDetail(selectedPlaylistID);
  runSearch().catch(console.error);
});

deletePlaylistButton.addEventListener("click", async () => {
  const playlist = playlists.find((item) => item.id === selectedPlaylistID);
  if (!playlist?.can_edit || !confirm(`Delete playlist "${playlist.name}"?`)) return;
  await api(`/api/playlists/${playlist.id}`, {method: "DELETE"});
  selectedPlaylistID = 0;
  await loadPlaylists(0);
});

newPlaylistButton.addEventListener("click", () => {
  const open = playlistCreatePanel.hidden;
  playlistCreatePanel.hidden = !open;
  if (open) {
    playlistNameInput.focus();
  }
});

playlistCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = playlistNameInput.value.trim();
  if (!name) return;
  const playlist = await api("/api/playlists", {
    method: "POST",
    body: JSON.stringify({name}),
  });
  playlistNameInput.value = "";
  playlistCreatePanel.hidden = true;
  await loadPlaylists(playlist.id);
});

importPlaylistFolderButton.addEventListener("click", () => {
  playlistImportStatus.textContent = "";
  playlistFolderInput.value = "";
  playlistFolderInput.click();
});

playlistFolderInput.addEventListener("change", async () => {
  const playlist = playlists.find((item) => item.id === selectedPlaylistID);
  if (!playlist?.can_edit) return;
  const files = [...playlistFolderInput.files]
    .filter((file) => file.name.toLowerCase().endsWith(".mp3"))
    .map((file) => ({
      relative_path: file.webkitRelativePath || file.name,
      size: file.size,
      last_modified_ms: file.lastModified,
    }));
  if (files.length === 0) {
    playlistImportStatus.textContent = "The selected folder contains no MP3 files";
    return;
  }
  importPlaylistFolderButton.disabled = true;
  playlistImportStatus.textContent = `Matching ${files.length} files...`;
  try {
    const result = await api(`/api/playlists/${playlist.id}/import-folder`, {
      method: "POST",
      body: JSON.stringify({files}),
    });
    if (result.imported > 0) {
      playlistImportStatus.textContent = "Playlist imported";
    } else if (result.duplicates > 0) {
      playlistImportStatus.textContent = "Playlist is already up to date";
    } else {
      playlistImportStatus.textContent = "No indexed tracks matched this folder";
    }
    await loadPlaylists(playlist.id);
  } catch (err) {
    playlistImportStatus.textContent = err.message || "Folder import failed";
  } finally {
    importPlaylistFolderButton.disabled = false;
  }
});

saveRoomSettingsButton.addEventListener("click", async () => {
  clearTimeout(roomSaveFeedbackTimer);
  saveRoomSettingsButton.disabled = true;
  saveRoomSettingsButton.textContent = "Saving...";
  roomSettingsStatus.textContent = "Saving...";
  roomSettingsStatus.title = "";
  const saveRequest = api(roomAPI("/api/admin/grants"), {
      method: "PUT",
      body: JSON.stringify({grants: readRoomSettingsGrants()}),
    }).then((settings) => ({settings}), (error) => ({error}));
  const [result] = await Promise.all([saveRequest, new Promise((resolve) => setTimeout(resolve, minimumRoomSaveFeedbackMS))]);
  if (result.error) {
    saveRoomSettingsButton.textContent = "Failed";
    roomSettingsStatus.textContent = "Failed";
    roomSettingsStatus.title = result.error.message || "Save failed";
  } else {
    const settings = result.settings;
    renderRoomSettings(settings.grants || {});
    saveRoomSettingsButton.textContent = "Saved";
    roomSettingsStatus.textContent = "Saved";
    roomSettingsStatus.title = "";
    api(roomAPI("/api/state")).then(renderState).catch(console.error);
  }
  roomSaveFeedbackTimer = setTimeout(() => {
    saveRoomSettingsButton.disabled = false;
    saveRoomSettingsButton.textContent = "Save";
    roomSettingsStatus.textContent = "";
    roomSettingsStatus.title = "";
  }, roomSaveResultVisibleMS);
});

document.getElementById("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

searchInput.addEventListener("input", () => {
  storageSet(searchTextStorageKey, searchInput.value);
  clearTimeout(searchTimer);
  resultsEl.replaceChildren();
  searchTimer = setTimeout(() => {
    runSearch().catch(console.error);
  }, searchDebounceMS);
});

searchField.addEventListener("change", () => {
  storageSet(searchFieldStorageKey, searchField.value);
  clearTimeout(searchTimer);
  runSearch().catch(console.error);
});

for (const [id, action] of [["previous", "previous"], ["skip", "skip"]]) {
  document.getElementById(id).addEventListener("click", async () => {
    await command({action});
  });
}

togglePlaybackButton.addEventListener("click", async () => {
  if (lastState && lastState.current && !lastState.paused) {
    await command({action: "pause"});
    return;
  }
  await command({action: "play"});
});

seekInput.addEventListener("input", () => {
  seeking = true;
  setSeekUI(Number(seekInput.value));
});

seekInput.addEventListener("change", async () => {
  if (!hasMedia()) {
    seeking = false;
    setSeekUI(0);
    return;
  }
  const positionMS = Math.max(0, Math.round(Number(seekInput.value) * 1000));
  seeking = false;
  await command({action: "seek", position_ms: positionMS});
});

volumeInput.addEventListener("input", () => {
  const next = Number(volumeInput.value);
  if (!Number.isFinite(next)) return;
  if (volumeMode === "room") {
    applyAudioSettings(next, false);
  } else {
    localVolume = next;
    localMuted = next === 0;
    storageSet(localVolumeStorageKey, localVolume);
    storageSet(localMutedStorageKey, localMuted);
    applyAudioSettings(localVolume, localMuted);
  }
});

volumeInput.addEventListener("change", async () => {
  if (volumeMode !== "room" || !hasRoomPermission("volume_control")) return;
  try {
    await command({action: "room_audio", volume: Number(volumeInput.value), muted: false});
  } catch (err) {
    console.error(err);
    renderVolumeControl();
  }
});

volumeModeButton.addEventListener("click", () => {
  volumeMode = volumeMode === "room" ? "local" : "room";
  storageSet(volumeModeStorageKey(), volumeMode);
  renderVolumeControl();
});

muteButton.addEventListener("click", async () => {
  if (volumeMode === "room") {
    if (!hasRoomPermission("volume_control")) return;
    const roomAudio = lastState?.room_audio || {volume: defaultVolume, muted: false};
    const muted = !roomAudio.muted && roomAudio.volume > 0;
    const volume = !muted && roomAudio.volume === 0 ? defaultVolume : roomAudio.volume;
    await command({action: "room_audio", volume, muted});
    return;
  }
  if (localMuted || localVolume === 0) {
    if (localVolume === 0) localVolume = defaultVolume;
    localMuted = false;
  } else {
    localMuted = true;
  }
  storageSet(localVolumeStorageKey, localVolume);
  storageSet(localMutedStorageKey, localMuted);
  applyAudioSettings(localVolume, localMuted);
});

presenceButton.addEventListener("click", () => {
  const nextOpen = listenerListEl.hidden;
  listenerListEl.hidden = !nextOpen;
  presenceButton.setAttribute("aria-expanded", String(nextOpen));
});

queueChangesButton.addEventListener("click", () => {
  const nextOpen = queueChangesListEl.hidden;
  queueChangesListEl.hidden = !nextOpen;
  queueChangesButton.setAttribute("aria-expanded", String(nextOpen));
});

document.addEventListener("click", (event) => {
  closePlaylistAddMenus();
  if (!event.target.closest(".auto-dj-control")) closeAutoDJSourceMenu();
  if (!event.target.closest(".queue-changes-menu")) {
    queueChangesListEl.hidden = true;
    queueChangesButton.setAttribute("aria-expanded", "false");
  }
  if (event.target.closest(".presence-menu")) {
    return;
  }
  listenerListEl.hidden = true;
  presenceButton.setAttribute("aria-expanded", "false");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  closePlaylistAddMenus();
  closeAutoDJSourceMenu();
  if (!roomSettingsView.hidden) closeRoomSettings();
  listenerListEl.hidden = true;
  presenceButton.setAttribute("aria-expanded", "false");
  queueChangesListEl.hidden = true;
  queueChangesButton.setAttribute("aria-expanded", "false");
});

restoreSearchPreferences();
restoreRailPreferences();
renderPlaybackButton(false);
applyAudioSettings(0, false);

clearQueueButton.addEventListener("click", async () => {
  await command({action: "queue_clear"});
});

autoDJButton.addEventListener("click", async () => {
  const enabled = autoDJButton.dataset.enabled !== "true";
  await command({action: "auto_dj", enabled});
});

autoDJSourceButton.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (!autoDJSourceMenu.hidden) {
    closeAutoDJSourceMenu();
    return;
  }
  autoDJSourceMenu.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "auto-dj-source-status";
  loading.textContent = "Loading sources...";
  autoDJSourceMenu.append(loading);
  autoDJSourceMenu.hidden = false;
  autoDJSourceButton.setAttribute("aria-expanded", "true");
  try {
    const availablePlaylists = await api("/api/playlists");
    if (!autoDJSourceMenu.hidden) renderAutoDJSourceMenu(availablePlaylists);
  } catch (err) {
    console.error(err);
    loading.textContent = err.message || "Could not load shuffle sources";
  }
});

clearHistoryButton.addEventListener("click", async () => {
  await command({action: "history_clear"});
});

roomSelect.addEventListener("change", () => {
  switchRoom(roomSelect.value).catch(console.error);
});

window.addEventListener("popstate", () => {
  const roomID = decodeURIComponent(location.pathname.match(/^\/rooms\/([^/]+)/)?.[1] || "");
  if (roomID) switchRoom(roomID, false).catch(console.error);
});

logoutForm.addEventListener("submit", () => {
  closeEvents();
});

window.addEventListener("pagehide", closeEvents);

async function start() {
  if (!await loadRooms()) {
    return;
  }
  history.replaceState(null, "", `/rooms/${encodeURIComponent(currentRoomID)}`);
  restoreVolumePreferences();
  initQueueSortable();
  connectEvents();
  loadLibraryStatus();
  loadPlaylists().catch(console.error);
  runSearch().catch(console.error);
  api(roomAPI("/api/state")).then(renderState).catch(console.error);
}

start().catch(console.error);
