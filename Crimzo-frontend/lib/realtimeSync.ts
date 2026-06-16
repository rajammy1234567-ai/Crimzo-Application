type Listener = (...args: unknown[]) => void;

const listeners: Record<string, Set<Listener>> = {};

export function subscribe(event: string, cb: Listener) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(cb);
  return () => listeners[event].delete(cb);
}

export function publish(event: string, ...args: unknown[]) {
  listeners[event]?.forEach((cb) => {
    try {
      cb(...args);
    } catch (e) {
      console.error(`[realtimeSync] ${event} listener error:`, e);
    }
  });
}