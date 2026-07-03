type Listener = (...args: unknown[]) => void;

const listeners: Record<string, Set<Listener>> = {};
const lastPublished: Record<string, unknown[]> = {};

type SubscribeOptions = {
  replay?: boolean;
};

export function subscribe(event: string, cb: Listener, options?: SubscribeOptions) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(cb);
  if (options?.replay && lastPublished[event]) {
    try {
      cb(...lastPublished[event]);
    } catch (e) {
      console.error(`[realtimeSync] ${event} replay listener error:`, e);
    }
  }
  return () => {
    listeners[event].delete(cb);
  };
}

export function publish(event: string, ...args: unknown[]) {
  lastPublished[event] = args;
  listeners[event]?.forEach((cb) => {
    try {
      cb(...args);
    } catch (e) {
      console.error(`[realtimeSync] ${event} listener error:`, e);
    }
  });
}