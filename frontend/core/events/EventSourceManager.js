// Server-Sent Events connection manager
export class EventSourceManager {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.es = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.shouldReconnect = true;
  }

  connect() {
    if (this.es) return;

    this.es = new EventSource(this.url);

    this.es.addEventListener("open", () => {
      this.reconnectDelay = 1000;
      this.handlers.onOpen?.();
    });

    this.es.addEventListener("error", (err) => {
      this.handlers.onError?.(err);
      this.scheduleReconnect();
    });

    for (const [event, handler] of Object.entries(this.handlers)) {
      if (event.startsWith("on")) continue;
      this.es.addEventListener(event, (e) => {
        try {
          handler(JSON.parse(e.data));
        } catch (err) {
          this.handlers.onParseError?.(err, e.data);
        }
      });
    }
  }

  scheduleReconnect() {
    if (!this.shouldReconnect) return;
    this.close();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  close() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  setHandlers(handlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }
}

export function createEventSourceManager(url, handlers) {
  return new EventSourceManager(url, handlers);
}