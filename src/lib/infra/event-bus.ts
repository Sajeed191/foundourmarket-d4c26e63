/**
 * Infrastructure v2.0 — tiny typed pub/sub.
 *
 * Zero React, zero deps. Used by every infra module so we never poll on the
 * render thread and never introduce cross-module imports beyond this bus.
 *
 * Channels are open-ended strings; typed helpers are exported per module.
 */

export type InfraEventMap = {
  // Network quality: 'slow-2g' | '2g' | '3g' | '4g' | 'wifi' | 'offline'
  "network:quality": { tier: string; saveData: boolean };
  "network:online": void;
  "network:offline": void;

  // Request queue lifecycle
  "queue:enqueued": { id: string; kind: string; size: number };
  "queue:flushed": { id: string; kind: string; attempts: number };
  "queue:failed": { id: string; kind: string; attempts: number; reason: string };
  "queue:drained": { size: number };

  // Health monitor
  "health:ok": { checkedAt: number };
  "health:degraded": { subsystem: string; detail?: string };
  "health:recovered": { subsystem: string };

  // Service worker / deployment
  "sw:registered": void;
  "sw:updated": void;
  "deploy:ready": { version: string };
  "deploy:activated": { version: string };
  "cache:repair": { scope: string };
  "cache:repaired": { scope: string };

  // Infrastructure v2.0 (self-healing SW)
  "infra:chunk-recovered": { url: string };
  "infra:deployment-detected": { version: string };
  "infra:deployment-activated": { version: string; active?: string };
};


type Handler<T> = (payload: T) => void;

const listeners = new Map<string, Set<Handler<unknown>>>();

export function on<K extends keyof InfraEventMap>(
  event: K,
  handler: Handler<InfraEventMap[K]>,
): () => void {
  let set = listeners.get(event as string);
  if (!set) {
    set = new Set();
    listeners.set(event as string, set);
  }
  set.add(handler as Handler<unknown>);
  return () => set!.delete(handler as Handler<unknown>);
}

export function emit<K extends keyof InfraEventMap>(
  event: K,
  payload: InfraEventMap[K],
): void {
  const set = listeners.get(event as string);
  if (!set || set.size === 0) return;
  // Copy to array so handlers that unsubscribe during dispatch don't break iteration.
  for (const h of Array.from(set)) {
    try {
      (h as Handler<InfraEventMap[K]>)(payload);
    } catch {
      // Never let a subscriber crash the bus.
    }
  }
}

export function clearAllListeners() {
  listeners.clear();
}
