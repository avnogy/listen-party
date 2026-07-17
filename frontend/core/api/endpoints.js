export function roomAPI(roomId, path) {
  return `/rooms/${encodeURIComponent(roomId)}${path}`;
}

export function adminAPI(path) {
  return `/api/admin${path}`;
}

export function mediaURL(trackId, suffix = "") {
  return `/media/${trackId}${suffix}?v=${encodeURIComponent(trackId || "")}`;
}

export function mediaURLWithKey(track, suffix = "") {
  return `/media/${track.id}${suffix}?v=${encodeURIComponent(track.dedupe_key || "")}`;
}