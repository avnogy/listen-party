// Pure formatting helpers for admin scan status and configuration display.

export function formatScanTime(value) {
  if (!value || value === "0001-01-01T00:00:00Z") return "Never rescanned";
  return `Last rescanned ${new Date(value).toLocaleString()}`;
}

export function formatRate(value) {
  if (!Number.isFinite(value)) return "0/s";
  return `${value.toFixed(value >= 10 ? 0 : 1)}/s`;
}

export function shortPath(path) {
  return (path || "").split(/[\\/]/).filter(Boolean).pop() || path;
}
