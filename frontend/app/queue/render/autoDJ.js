// Auto-DJ source menu
export function closeAutoDJSourceMenu(autoDJSourceMenu, autoDJSourceButton) {
  autoDJSourceMenu.hidden = true;
  autoDJSourceButton.setAttribute("aria-expanded", "false");
}

export function renderAutoDJSourceMenu(availablePlaylists, autoDJSourceMenu, autoDJSourceButton, store, command) {
  const selected = store.getState().lastState?.auto_dj?.source || { type: "library" };
  const sources = [
    { type: "library", name: "Entire Library" },
    ...availablePlaylists.map((playlist) => ({ type: "playlist", playlist_id: playlist.id, name: playlist.name })),
  ];
  autoDJSourceMenu.replaceChildren(...sources.map((source) => {
    const active = source.type === selected.type && (source.type !== "playlist" || source.playlist_id === selected.playlist_id);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "auto-dj-source-option";
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(active));
    item.textContent = source.name;
    item.addEventListener("click", async () => {
      if (active) {
        closeAutoDJSourceMenu(autoDJSourceMenu, autoDJSourceButton);
        return;
      }
      item.disabled = true;
      try {
        await command({
          action: "auto_dj_source",
          source: source.type === "playlist" ? { type: "playlist", playlist_id: source.playlist_id } : { type: "library" },
        });
        closeAutoDJSourceMenu(autoDJSourceMenu, autoDJSourceButton);
      } catch (err) {
        console.error(err);
        item.disabled = false;
        const error = document.createElement("p");
        error.className = "auto-dj-source-error";
        error.textContent = err.message || "Could not change Auto-DJ source";
        autoDJSourceMenu.append(error);
      }
    });
    return item;
  }));
}