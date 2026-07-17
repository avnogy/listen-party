// Presence list rendering
export function renderPresence(state, listenerListEl, presenceEl, store, api, roomAPI) {
  const listeners = Array.isArray(state.listeners) ? state.listeners : [];
  const count = listeners.length;
  presenceEl.textContent = `${count} listener${count === 1 ? "" : "s"}`;
  listenerListEl.replaceChildren(...listeners.map((username) => {
    const item = document.createElement("div");
    item.className = "listener-item";
    const name = document.createElement("span");
    name.className = "listener-name";
    name.textContent = username;
    item.append(name);
    if (store.getState().canAdministerCurrentRoom) {
      const disconnect = document.createElement("button");
      disconnect.className = "secondary compact listener-disconnect";
      disconnect.type = "button";
      disconnect.textContent = "Disconnect";
      disconnect.addEventListener("click", async () => {
        disconnect.disabled = true;
        try {
          await api(roomAPI("/api/admin/disconnect"), {
            method: "POST",
            body: JSON.stringify({ username }),
          });
        } catch (err) {
          console.error(err);
          disconnect.disabled = false;
        }
      });
      item.append(disconnect);
    }
    return item;
  }));
  if (listeners.length === 0) {
    const empty = document.createElement("div");
    empty.className = "listener-item empty";
    empty.textContent = "No active users";
    listenerListEl.append(empty);
  }
}