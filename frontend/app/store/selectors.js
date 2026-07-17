// Derived state selectors
import { CONFIG } from "./persistence.js";

export const selectors = {
  currentRoomId: (state) => state.currentRoomId,
  currentPermissions: (state) => state.currentPermissions,
  canAdministerCurrentRoom: (state) => state.canAdministerCurrentRoom,

  lastState: (state) => state.lastState,
  lastStateReceivedAt: (state) => state.lastStateReceivedAt,
  generation: (state) => state.generation,
  revision: (state) => state.revision,
  serverTime: (state) => state.serverTime,

  queueDragActive: (state) => state.queueDragActive,
  queueReorderPending: (state) => state.queueReorderPending,
  pendingQueueState: (state) => state.pendingQueueState,

  volumeMode: (state) => state.volumeMode,
  localVolume: (state) => state.localVolume,
  localMuted: (state) => state.localMuted,

  selectedPlaylistId: (state) => state.selectedPlaylistId,
  playlists: (state) => state.playlists,
  railMode: (state) => state.railMode,
  searchText: (state) => state.searchText,
  searchField: (state) => state.searchField,
  searchTimer: (state) => state.searchTimer,
  seeking: (state) => state.seeking,

  roomSaveFeedbackTimer: (state) => state.roomSaveFeedbackTimer,
  playbackRecoveryAt: (state) => state.playbackRecoveryAt,
  events: (state) => state.events,

  // Derived
  hasMedia: (state) => state.lastState?.current?.track != null,
  currentTrack: (state) => state.lastState?.current?.track || null,
  currentDedupeKey: (state) => state.lastState?.current?.dedupe_key || null,
  isPlaying: (state) => state.lastState?.current && !state.lastState?.paused,
  isPaused: (state) => state.lastState?.paused === true,
  queue: (state) => state.lastState?.queue || [],
  history: (state) => state.lastState?.history || [],
  autoDJ: (state) => state.lastState?.auto_dj || { enabled: false, source: { type: "library", name: "Entire Library" } },
  roomAudio: (state) => state.lastState?.room_audio || { volume: CONFIG.defaultVolume, muted: false },
  listeners: (state) => state.lastState?.listeners || [],
  queueChanges: (state) => state.lastState?.actions || [],
  startedAt: (state) => state.lastState?.started_at || null,
  positionAtPauseMs: (state) => state.lastState?.position_at_pause_ms || 0,

  // Permissions
  canControlPlayback: (state) => state.currentPermissions.has("playback_control"),
  canManageQueue: (state) => state.currentPermissions.has("queue_manage"),
  canAddToQueue: (state) => state.currentPermissions.has("queue_add"),
  canControlVolume: (state) => state.currentPermissions.has("volume_control"),

  // Volume
  effectiveVolume: (state) =>
    state.volumeMode === "room" ? state.roomAudio.volume : state.localVolume,
  effectiveMuted: (state) =>
    state.volumeMode === "room" ? state.roomAudio.muted : state.localMuted || state.localVolume === 0,

  // Search
  hasSearchText: (state) => state.searchText.trim().length > 0,

  // Queue item helpers
  queueItemById: (state, id) => state.lastState?.queue?.find((item) => item.id === id) || null,
};