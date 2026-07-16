// Shared browser helpers. Kept as a classic script so feature files need no
// bundler or module system.

const dom = {
  id(id) {
    return document.getElementById(id);
  },

  all(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  },

  element(tag, {className, text, ...attributes} = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    for (const [name, value] of Object.entries(attributes)) {
      if (value == null) continue;
      if (name === "dataset") {
        Object.assign(element.dataset, value);
      } else if (name in element && !name.startsWith("aria-") && name !== "role") {
        element[name] = value;
      } else {
        element.setAttribute(name, String(value));
      }
    }
    return element;
  },

  replaceChildren(container, children) {
    container.replaceChildren(...children);
  },
};

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.dataset.kind = kind;
}

function storageGet(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable in private browsing or restricted frames.
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {"Content-Type": "application/json", ...(options.headers || {})},
    ...options,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}
