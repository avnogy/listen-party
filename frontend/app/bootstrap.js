// Main app bootstrap - creates store, components, and wires them together
import { createStore } from "../core/store/createStore.js";
import { initialState } from "./store/state.js";
import { storageSet } from "../core/store/persistence.js";
import { api, roomAPI } from "../core/api/index.js";
import { createCoordinator } from "./coordinator.js";
import { createEventsComponent, createPlaybackComponent, createQueueComponent, createRoomComponent, createPlaylistsComponent, createLibraryComponent } from "./components/index.js";

// Create store
export const store = createStore(initialState);

// Persistence
store.subscribe((state) => {
  storageSet("listen-party.searchText", state.searchText);
  storageSet("listen-party.searchField", state.searchField);
  storageSet("listen-party.railMode", state.railMode);
  storageSet("listen-party.selectedPlaylist", state.selectedPlaylistId);
  storageSet("listen-party.localVolume", state.localVolume);
  storageSet("listen-party.localMuted", state.localMuted);
  storageSet(`listen-party.volumeMode.${state.currentRoomId || "default"}`, state.volumeMode);
});

// Create coordinator
const coordinator = createCoordinator(store);

// Create components (order matters: dependencies first)
const events = createEventsComponent(store);
const playback = createPlaybackComponent(store);
const queue = createQueueComponent(store, { renderState: coordinator.renderState });
const playlists = createPlaylistsComponent(store);
const room = createRoomComponent(store, { playlistsComponent: playlists });
const library = createLibraryComponent(store);

// Register components with coordinator for render orchestration
coordinator.registerComponents([playback, queue, events, room, playlists]);

// Room switching
async function loadRooms(sessionInfo = null) {
  const info = sessionInfo || await api("/api/session");
  const rooms = info.rooms || [];
  const currentRoomId = store.getState().currentRoomId || info.default_room_id || (rooms[0] && rooms[0].id) || "main";

  if (rooms.length > 0 && !rooms.some((room) => room.id === currentRoomId)) {
    store.setState({ currentRoomId: rooms[0].id });
  }

  const roomSelect = document.getElementById("roomSelect");
  const currentUserEl = document.getElementById("currentUser");

  if (currentUserEl) currentUserEl.textContent = info.user?.display_name || info.user?.username || "Signed in";

  roomSelect.replaceChildren(...rooms.map((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name || room.id;
    return option;
  }));
  roomSelect.value = currentRoomId;
  roomSelect.disabled = rooms.length <= 1;

  store.setState({
    currentRoomId,
    currentPermissions: new Set(info.permissions?.[currentRoomId] || []),
    canAdministerCurrentRoom: Boolean(info.room_administration?.[currentRoomId]),
  });

  if (info.disconnected?.[currentRoomId]) {
    playback.forceLogout();
    return false;
  }
  return true;
}

async function switchRoom(roomId, updateHistory = true) {
  if (!roomId || roomId === store.getState().currentRoomId) return;
  const roomSelect = document.getElementById("roomSelect");
  roomSelect.disabled = true;

  try {
    events.closeEvents();
    document.getElementById("audio")?.pause();
    room.closeRoomSettings();
    events.closeAutoDJSourceMenu();

    store.setState({
      currentRoomId: roomId,
      lastState: null,
      lastStateReceivedAt: 0,
      queueDragActive: false,
      queueReorderPending: false,
      pendingQueueState: null,
    });

    if (updateHistory) history.pushState(null, "", `/rooms/${encodeURIComponent(roomId)}`);

    const [info, state] = await Promise.all([
      api("/api/session"),
      api(`/rooms/${encodeURIComponent(roomId)}/api/state`),
    ]);

    if (!(info.rooms || []).some((room) => room.id === roomId)) {
      throw new Error("room not found");
    }

    if (!await loadRooms(info)) return;
    playback.restoreVolumePreferences();
    coordinator.renderState(state);
    events.connectEvents();
  } catch (err) {
    console.error(err);
    roomSelect.value = store.getState().currentRoomId;
    history.replaceState(null, "", `/rooms/${encodeURIComponent(store.getState().currentRoomId)}`);
  } finally {
    roomSelect.disabled = (roomSelect?.options?.length || 0) <= 1;
    queue.updateSortable();
  }
}

// Room select and popstate
const roomSelect = document.getElementById("roomSelect");
roomSelect?.addEventListener("change", () => {
  switchRoom(roomSelect.value).catch(console.error);
});

window.addEventListener("popstate", () => {
  const roomId = decodeURIComponent(location.pathname.match(/^\/rooms\/([^/]+)/)?.[1] || "");
  if (roomId) switchRoom(roomId, false).catch(console.error);
});

// Logout
const logoutForm = document.getElementById("logoutForm");
logoutForm?.addEventListener("submit", () => events.closeEvents());

// Initial load
async function start() {
  if (!await loadRooms()) return;

  history.replaceState(null, "", `/rooms/${encodeURIComponent(store.getState().currentRoomId)}`);

  // Start components
  events.start();
  playback.start();
  queue.start();
  playlists.start();
  room.start();
  library.start();

  // Connect SSE
  events.connectEvents();

  // Fetch initial state
  api(roomAPI(store.getState().currentRoomId, "/api/state")).then((state) => coordinator.renderState(state)).catch(console.error);
}

start().catch(console.error);

// Export for testing
export { store as appStore };
