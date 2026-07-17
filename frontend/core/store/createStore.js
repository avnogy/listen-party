// Minimal store factory - pub/sub + getState
export function createStore(initialState = {}) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },

    setState(partial) {
      const nextState = typeof partial === "function" ? partial(state) : { ...state, ...partial };
      if (nextState !== state) {
        state = nextState;
        listeners.forEach((listener) => listener(state));
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    select(selector) {
      return selector(state);
    },
  };
}

// Selector helpers
export function createSelector(store, selector) {
  let lastResult = selector(store.getState());
  return (state) => {
    const result = selector(state);
    if (result !== lastResult) {
      lastResult = result;
    }
    return result;
  };
}