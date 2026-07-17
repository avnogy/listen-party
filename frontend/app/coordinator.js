// State coordinator - validates server state and delegates rendering to components
export function createCoordinator(store) {
  let components = [];

  function registerComponents(c) {
    components = c;
  }

  function samePlaybackTimeline(a, b) {
    return Boolean(a && b && a.current?.dedupe_key === b.current?.dedupe_key && a.started_at === b.started_at && a.paused === b.paused && a.position_at_pause_ms === b.position_at_pause_ms);
  }

  function renderState(state) {
    const revision = Number(state?.revision);
    const serverTime = Date.parse(state?.server_time);

    if (typeof state?.generation !== "string" || !state.generation || !Number.isSafeInteger(revision) || revision < 0 || !Number.isFinite(serverTime)) {
      components.forEach((c) => c.recoverPlaybackClient?.("malformed playback state"));
      return;
    }

    if (state.room_id && store.getState().currentRoomId && state.room_id !== store.getState().currentRoomId) {
      return;
    }

    const currentState = store.getState();
    if (currentState.lastState) {
      if (state.generation !== currentState.lastState.generation) {
        components.forEach((c) => c.onGenerationChange?.());
        store.setState({ lastState: null, lastStateReceivedAt: 0, pendingQueueState: null });
      } else {
        const lastRevision = Number(currentState.lastState.revision);
        const lastServerTime = Date.parse(currentState.lastState.server_time);
        if (revision < lastRevision) return;
        if (revision === lastRevision && serverTime < lastServerTime) return;
      }
    }

    if (currentState.queueDragActive || currentState.queueReorderPending) {
      if (!currentState.pendingQueueState || Date.parse(state.server_time) >= Date.parse(currentState.pendingQueueState.server_time)) {
        store.setState({ pendingQueueState: state });
      }
      return;
    }

    if (Array.isArray(state.permissions)) {
      store.setState({ currentPermissions: new Set(state.permissions) });
    }

    const timelineChanged = !samePlaybackTimeline(currentState.lastState, state);
    store.setState({ lastState: state, lastStateReceivedAt: Date.now() });

    for (const c of components) {
      c.render(state, timelineChanged);
    }
  }

  return { renderState, registerComponents };
}
