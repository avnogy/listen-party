// History rendering
import { trackRow, standardTrackCommands, playbackRequester } from "./index.js";

export function renderHistoryItem(item, actions) {
  const track = item.track;
  const dedupeKey = item.dedupe_key;
  return trackRow(
    track || { title: "Unavailable track", dedupe_key: dedupeKey },
    standardTrackCommands(dedupeKey),
    playbackRequester(item),
    dedupeKey,
    [],
    true
  );
}

export function renderHistory(history, historyEl, actions, emptyHint) {
  if (history.length === 0) {
    const empty = emptyHint("No previously played tracks");
    historyEl.replaceChildren(empty);
    return;
  }
  historyEl.replaceChildren(...history.map((item) => renderHistoryItem(item, actions)));
}