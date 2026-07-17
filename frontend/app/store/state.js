// Initial state shape for the app
export const initialState = {
  // Room/session
  currentRoomId: decodeURIComponent(location.pathname.match(/^\/rooms\/([^/]+)/)?.[1] || ""),
  currentPermissions: new Set(),
  canAdministerCurrentRoom: false,

  // Playback state from SSE
  lastState: null,
  lastStateReceivedAt: 0,

  // Volume
  volumeMode: "local",
  localVolume: 0,
  localMuted: false,

  // UI state
  selectedPlaylistId: 0,
  playlists: [],
  railMode: "library",
  searchText: "",
  searchField: "",

  // Queue interaction
  queueDragActive: false,
  queueReorderPending: false,
  pendingQueueState: null,

  // Timers
  searchTimer: 0,
  roomSaveFeedbackTimer: 0,

  // Recovery
  events: null,
  playbackRecoveryAt: 0,
};