// Playlists component - playlist list, detail, CRUD operations
import { api } from "../../../core/api/client.js";
import { loadPlaylists as rawLoadPlaylists, loadPlaylistDetail as rawLoadPlaylistDetail, updatePlaylistActionButtons as rawUpdatePlaylistActionButtons, renderPlaylistItem as rawRenderPlaylistItem, renderPlaylistDetail as rawRenderPlaylistDetail, createPlaylist as rawCreatePlaylist, deletePlaylist as rawDeletePlaylist, importPlaylistFolder as rawImportPlaylistFolder } from "../../playlists/component.js";

export function createPlaylistsComponent(store) {
  const ui = {
    playlistSelect: document.getElementById("playlistSelect"),
    playlistNameInput: document.getElementById("playlistName"),
    playlistCreatePanel: document.getElementById("playlistCreatePanel"),
    playlistCreateForm: document.getElementById("playlistCreateForm"),
    newPlaylistButton: document.getElementById("newPlaylist"),
    deletePlaylistButton: document.getElementById("deletePlaylist"),
    importPlaylistFolderButton: document.getElementById("importPlaylistFolder"),
    playlistFolderInput: document.getElementById("playlistFolderInput"),
    playlistImportStatus: document.getElementById("playlistImportStatus"),
    playlistDetailEl: document.getElementById("playlistDetail"),
  };

  function loadPlaylists(selectId = store.getState().selectedPlaylistId) {
    return rawLoadPlaylists(api, store, ui, selectId);
  }

  function loadPlaylistDetail(id) {
    return rawLoadPlaylistDetail(api, store, ui, id);
  }

  function updatePlaylistActionButtons(state) {
    rawUpdatePlaylistActionButtons(ui, state || store.getState());
  }

  function renderPlaylistItem(playlist, item) {
    return rawRenderPlaylistItem(playlist, item, ui, store);
  }

  function renderPlaylistDetail(playlist, allPlaylists) {
    rawRenderPlaylistDetail(playlist, ui, allPlaylists, store);
  }

  function createPlaylist(name) {
    return rawCreatePlaylist(api, name);
  }

  function deletePlaylist(id) {
    return rawDeletePlaylist(api, id);
  }

  function importPlaylistFolder(playlistId, files) {
    return rawImportPlaylistFolder(api, playlistId, files);
  }

  return {
    start() {
      if (ui.playlistSelect) {
        ui.playlistSelect.addEventListener("change", () => {
          const id = Number(ui.playlistSelect.value);
          store.setState({ selectedPlaylistId: id });
          localStorage.setItem("listen-party.selectedPlaylist", String(id));
          loadPlaylistDetail(id).catch(console.error);
        });
      }

      if (ui.newPlaylistButton) {
        ui.newPlaylistButton.addEventListener("click", () => {
          if (ui.playlistCreatePanel) ui.playlistCreatePanel.hidden = !ui.playlistCreatePanel.hidden;
          if (ui.playlistNameInput) ui.playlistNameInput.focus();
        });
      }

      if (ui.playlistCreateForm) {
        ui.playlistCreateForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const name = ui.playlistNameInput?.value?.trim();
          if (!name) return;
          try {
            const playlist = await createPlaylist(name);
            if (ui.playlistNameInput) ui.playlistNameInput.value = "";
            if (ui.playlistCreatePanel) ui.playlistCreatePanel.hidden = true;
            await loadPlaylists(playlist.id);
          } catch (err) {
            console.error(err);
          }
        });
      }

      if (ui.deletePlaylistButton) {
        ui.deletePlaylistButton.addEventListener("click", async () => {
          const id = store.getState().selectedPlaylistId;
          if (!id) return;
          if (!confirm("Delete this playlist?")) return;
          try {
            await deletePlaylist(id);
            await loadPlaylists();
          } catch (err) {
            console.error(err);
          }
        });
      }

      if (ui.importPlaylistFolderButton) {
        ui.importPlaylistFolderButton.addEventListener("click", () => {
          ui.playlistFolderInput?.click();
        });
      }

      if (ui.playlistFolderInput) {
        ui.playlistFolderInput.addEventListener("change", async () => {
          const files = [...(ui.playlistFolderInput.files || [])].map((f) => f.webkitRelativePath || f.name);
          if (files.length === 0) return;
          const playlistId = store.getState().selectedPlaylistId;
          if (!playlistId) return;
          if (ui.playlistImportStatus) ui.playlistImportStatus.textContent = "Importing...";
          try {
            await importPlaylistFolder(playlistId, files);
            if (ui.playlistImportStatus) ui.playlistImportStatus.textContent = "Import complete";
            await loadPlaylistDetail(playlistId);
          } catch (err) {
            if (ui.playlistImportStatus) ui.playlistImportStatus.textContent = `Import failed: ${err.message}`;
            console.error(err);
          }
          ui.playlistFolderInput.value = "";
          setTimeout(() => {
            if (ui.playlistImportStatus) ui.playlistImportStatus.textContent = "";
          }, 3000);
        });
      }

      loadPlaylists().catch(console.error);
    },

    render(state) {
      updatePlaylistActionButtons({ ...state, playlists: state.playlists || store.getState().playlists });
    },

    teardown() {
      // No cleanup needed
    },

    // Public API for other components
    loadPlaylists,
    loadPlaylistDetail,
    updatePlaylistActionButtons,
    renderPlaylistItem,
    renderPlaylistDetail,
    createPlaylist,
    deletePlaylist,
    importPlaylistFolder,
  };
}
