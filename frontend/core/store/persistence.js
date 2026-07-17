// localStorage persistence utilities
export function storageGet(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable (private browsing, restricted iframe)
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function createPersistedState(store, key, { serialize = JSON.stringify, deserialize = JSON.parse } = {}) {
  // Load initial state
  const stored = storageGet(key);
  if (stored) {
    try {
      const parsed = deserialize(stored);
      store.setState(parsed);
    } catch {
      // Invalid stored data, ignore
    }
  }

  // Persist on changes
  return store.subscribe((state) => {
    storageSet(key, serialize(state));
  });
}

export function createSyncedSelector(store, key, selector, { serialize = JSON.stringify, deserialize = JSON.parse } = {}) {
  // Load initial
  const stored = storageGet(key);
  if (stored) {
    try {
      store.setState(deserialize(stored));
    } catch {
      // ignore
    }
  }

  // Subscribe to specific slice
  let lastValue = selector(store.getState());
  return store.subscribe((state) => {
    const value = selector(state);
    if (value !== lastValue) {
      lastValue = value;
      storageSet(key, serialize(value));
    }
  });
}