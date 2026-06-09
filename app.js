const audio = document.getElementById("audio");
const trackEl = document.getElementById("track");
const artistEl = document.getElementById("artist");
const queueEl = document.getElementById("queue");
const resultsEl = document.getElementById("results");
const rescanButton = document.getElementById("rescan");
const rescanStatus = document.getElementById("rescanStatus");
const clearQueueButton = document.getElementById("clearQueue");
const searchInput = document.getElementById("q");
const searchStatus = document.getElementById("searchStatus");
const libraryStatus = document.getElementById("libraryStatus");

let currentID = 0;
let currentPlaybackID = 0;
let statusTimer = 0;
let lastState = null;
let lastStateReceivedAt = 0;
let searchTimer = 0;
const suppressedEvents = {play: false, pause: false, seeked: false};
const suppressTimers = {play: 0, pause: 0, seeked: 0};

function label(track) {
  if (!track) return "";
  return [track.artist, track.album].filter(Boolean).join(" - ");
}

function trackSubtitle(track) {
  const parts = [track.artist, track.album].filter(Boolean);
  if (track.track_no) parts.push(`Track ${track.track_no}`);
  return parts.join(" - ");
}

function renderState(state) {
  lastState = state;
  lastStateReceivedAt = Date.now();

  const current = state.current;
  if (!current) {
    currentID = 0;
    currentPlaybackID = 0;
    audio.removeAttribute("src");
    trackEl.textContent = "Nothing playing";
    artistEl.textContent = "";
  } else {
    trackEl.textContent = current.title;
    artistEl.textContent = label(current);
    if (currentPlaybackID !== state.playback_id) {
      currentID = current.id;
      currentPlaybackID = state.playback_id;
      suppressNext("pause");
      suppressNext("seeked", 3000);
      audio.src = `/media/${current.id}`;
      audio.load();
    }
    syncAudio(state);
  }

  queueEl.replaceChildren(...state.queue.map(renderQueueItem));
  clearQueueButton.hidden = state.queue.length === 0;
}

function renderQueueItem(item) {
  const li = document.createElement("li");
  li.className = "queue-item";

  const track = item.track;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<div class="title"></div><div class="sub"></div>`;
  meta.querySelector(".title").textContent = track ? track.title : `Track ${item.track_id}`;
  meta.querySelector(".sub").textContent = track ? trackSubtitle(track) : "";

  const button = document.createElement("button");
  button.className = "icon-button small";
  button.title = "Remove from queue";
  button.setAttribute("aria-label", "Remove from queue");
  button.textContent = "×";
  button.addEventListener("click", async () => {
    renderState(await api("/api/queue/remove", {method: "POST", body: JSON.stringify({id: item.id})}));
  });

  li.append(meta, button);
  return li;
}

function suppressNext(eventName, ms = 1000) {
  suppressedEvents[eventName] = true;
  clearTimeout(suppressTimers[eventName]);
  suppressTimers[eventName] = setTimeout(() => {
    suppressedEvents[eventName] = false;
  }, ms);
}

function clearSuppression(eventName) {
  suppressedEvents[eventName] = false;
}

function consumeSuppressed(eventName) {
  if (!suppressedEvents[eventName]) {
    return false;
  }
  clearTimeout(suppressTimers[eventName]);
  clearSuppression(eventName);
  return true;
}

function setSyncedTime(target) {
  if (!Number.isFinite(target)) return;
  if (audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
  if (Math.abs(audio.currentTime - target) > 0.5) {
    suppressNext("seeked", 3000);
    try {
      audio.currentTime = target;
    } catch (err) {
      console.warn("could not seek synchronized media yet", err);
    }
  }
}

function syncAudio(state) {
  if (!state.started_at) {
    return;
  }
  if (state.paused) {
    setSyncedTime(Math.max(0, state.position_at_pause_ms / 1000));
    if (!audio.paused) {
      suppressNext("pause");
      audio.pause();
    }
    return;
  }

  const serverNow = Date.parse(state.server_time);
  const startedAt = Date.parse(state.started_at);
  const localElapsed = Math.max(0, Date.now() - lastStateReceivedAt);
  const target = Math.max(0, (serverNow - startedAt + localElapsed) / 1000);
  if (audio.paused) {
    suppressNext("play");
    audio.play().catch((err) => {
      console.warn("browser refused synchronized playback", err);
    });
  }
  setSyncedTime(target);
}

setInterval(() => {
  if (lastState && currentID) {
    syncAudio(lastState);
  }
}, 500);

async function publishPlayback(path, body = null) {
  try {
    const options = {method: "POST"};
    if (body) options.body = JSON.stringify(body);
    renderState(await api(path, options));
  } catch (err) {
    console.error(err);
  }
}

audio.addEventListener("play", () => {
  if (consumeSuppressed("play")) {
    return;
  }
  if (!currentID) {
    return;
  }
  publishPlayback("/api/playback/play");
});

audio.addEventListener("pause", () => {
  if (consumeSuppressed("pause")) {
    return;
  }
  if (!currentID || audio.ended || audio.seeking) {
    return;
  }
  publishPlayback("/api/playback/pause");
});

audio.addEventListener("loadedmetadata", () => {
  if (lastState && currentID) {
    syncAudio(lastState);
  }
});

audio.addEventListener("canplay", () => {
  if (lastState && currentID) {
    syncAudio(lastState);
  }
});

audio.addEventListener("seeked", () => {
  if (consumeSuppressed("seeked")) {
    return;
  }
  if (!currentID) {
    return;
  }
  publishPlayback("/api/playback/seek", {
    position_ms: Math.max(0, Math.round(audio.currentTime * 1000)),
  });
});

audio.addEventListener("ended", () => {
  if (!currentID) {
    return;
  }
  publishPlayback("/api/playback/ended", {track_id: currentID});
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {"Content-Type": "application/json"},
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

async function loadLibraryStatus() {
  try {
    const info = await api("/api/library");
    libraryStatus.textContent = `${info.track_count} tracks indexed`;
  } catch (err) {
    libraryStatus.textContent = "Library status unavailable";
    console.error(err);
  }
}

async function runSearch() {
  const q = searchInput.value.trim();
  searchStatus.textContent = q ? "Searching..." : "Recent tracks";
  const tracks = await api(`/api/search?q=${encodeURIComponent(q)}`);
  searchStatus.textContent = q ? `${tracks.length} result${tracks.length === 1 ? "" : "s"}` : "Recent tracks";
  resultsEl.replaceChildren(...tracks.map((track) => {
    const row = document.createElement("div");
    row.className = "item";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="title"></div><div class="sub"></div>`;
    meta.querySelector(".title").textContent = track.title;
    meta.querySelector(".sub").textContent = trackSubtitle(track);

    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = "Add";
    button.addEventListener("click", async () => {
      renderState(await api("/api/queue", {method: "POST", body: JSON.stringify({track_id: track.id})}));
    });

    row.append(meta, button);
    return row;
  }));
}

document.getElementById("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runSearch();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    runSearch().catch(console.error);
  }, 180);
});

for (const [id, path] of [["skip", "/api/playback/skip"]]) {
  document.getElementById(id).addEventListener("click", async () => {
    renderState(await api(path, {method: "POST"}));
  });
}

function setRescanStatus(message, kind = "") {
  clearTimeout(statusTimer);
  rescanStatus.textContent = message;
  rescanStatus.dataset.kind = kind;
  if (message && kind !== "working") {
    statusTimer = setTimeout(() => {
      rescanStatus.textContent = "";
      rescanStatus.dataset.kind = "";
    }, 4000);
  }
}

rescanButton.addEventListener("click", async () => {
  rescanButton.disabled = true;
  setRescanStatus("Rescanning library...", "working");
  try {
    await api("/api/admin/rescan", {method: "POST"});
    setRescanStatus("Library rescanned", "ok");
    await loadLibraryStatus();
    await runSearch();
  } catch (err) {
    setRescanStatus("Rescan failed", "error");
    console.error(err);
  } finally {
    rescanButton.disabled = false;
  }
});

clearQueueButton.addEventListener("click", async () => {
  renderState(await api("/api/queue/clear", {method: "POST"}));
});

new EventSource("/events").addEventListener("state", (event) => {
  renderState(JSON.parse(event.data));
});

loadLibraryStatus();
runSearch().catch(console.error);
api("/api/state").then(renderState).catch(console.error);
