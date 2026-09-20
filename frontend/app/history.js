import formatting from "./formatting.js";
import trackUi from "./track-ui.js";

const historyEl = document.getElementById("history");

function renderHistoryItem(item) {
  const track = item.track;
  const contentKey = item.content_key;
  return trackUi.trackRow(
    track || { title: "Unavailable track", content_key: contentKey },
    trackUi.standardTrackCommands(contentKey),
    formatting.playbackRequester(item),
    contentKey,
    [],
    true,
  );
}

function renderHistory(history) {
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No previously played tracks";
    historyEl.replaceChildren(empty);
    return;
  }
  historyEl.replaceChildren(...history.map(renderHistoryItem));
}

export default { renderHistoryItem, renderHistory };
