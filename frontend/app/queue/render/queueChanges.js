// Queue changes popover rendering
export function renderQueueChanges(actions, queueChangesButton, queueChangesListEl) {
  queueChangesButton.dataset.empty = String(actions.length === 0);
  queueChangesButton.textContent = actions.length ? `Queue changes ${actions.length}` : "Queue changes";
  queueChangesListEl.replaceChildren(...actions.map((action) => {
    const item = document.createElement("div");
    item.className = "queue-change-item";
    const meta = document.createElement("div");
    meta.className = "queue-change-meta";
    const metadata = [
      [(() => {
        const time = Date.parse(action.at || "");
        return Number.isFinite(time)
          ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(time))
          : "";
      })(), "queue-change-time"],
      [action.ip, "queue-change-ip"],
      [action.username, "queue-change-username"],
    ];
    for (const [value, className] of metadata) {
      if (!value) continue;
      const field = document.createElement("span");
      field.className = className;
      field.textContent = value;
      meta.append(field);
    }
    const text = document.createElement("div");
    text.className = "queue-change-text";
    text.textContent = action.text || "";
    item.append(meta, text);
    return item;
  }));
  if (actions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "queue-change-empty";
    empty.textContent = "No queue changes yet";
    queueChangesListEl.append(empty);
  }
}