// Room/playlists rendering utilities
import { emptyHint, trackTitle, trackContext, trackSubtitle, playbackRequester } from "../../core/util.js";
import { standardTrackCommands, trackRow, trashButton } from "../queue/render/index.js";

export function renderPlaylistItem(playlist, item) {
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
      const updated = await fetch(`/api/playlists/${playlist.id}/items/${item.id}`, { method: "DELETE" });
      renderPlaylistDetail(updated);
    });
    extraButtons.push(remove);
  }
  return trackRow(track, standardTrackCommands(dedupeKey), "", dedupeKey, extraButtons);
}

export function renderPlaylistDetail(playlist, playlistDetailEl) {
  const items = playlist.items || [];
  const list = document.createElement("div");
  list.className = "playlist-items";
  list.replaceChildren(...(items.length ? items.map((item) => renderPlaylistItem(playlist, item)) : [emptyHint("No tracks in this playlist")]));
  playlistDetailEl.replaceChildren(list);
}

export function updatePlaylistActionButtons(deletePlaylistButton, importPlaylistFolderButton, playlists, selectedPlaylistId) {
  const playlist = playlists.find((item) => item.id === selectedPlaylistId);
  deletePlaylistButton.hidden = !playlist?.can_edit;
  importPlaylistFolderButton.hidden = !playlist?.can_edit;
}