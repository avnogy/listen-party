// Empty state hint helper
export function emptyHint(text, tag = "p", className = "hint empty-state") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}