/**
 * Cache & Delivery telemetry — Phase 4C.
 * -------------------------------------
 * A tiny, dependency-free instrumentation layer for the client-side catalog
 * caches (products, categories, etc.). It records cache hits, misses,
 * stale-while-revalidate refreshes, invalidations, and failed refreshes so the
 * effectiveness of caching can be observed without a backend.
 *
 * This is observability ONLY — it never decides what is cached and never holds
 * any product/pricing/stock data. It keeps a small in-memory ring buffer and
 * running counters, exposed on `window.__cacheMetrics` for debugging. In dev it
 * also logs a compact line per event; in production it stays silent unless the
 * `?debugCache` flag / `data-debug-cache` attribute is present.
 *
 * NEVER instrument cart, checkout, payment, inventory, live-stock, auth, or
 * admin flows here — those must always read live data (see Phase 4C rules).
 */

export type CacheEventKind =
  | "hit"
  | "miss"
  | "revalidate" // stale-while-revalidate background refresh started
  | "invalidate" // cache dropped (e.g. admin edit / realtime)
  | "refresh-failed"
  | "slow"; // a refresh that exceeded the slow threshold

export type CacheEvent = {
  kind: CacheEventKind;
  scope: string; // e.g. "products", "categories"
  at: number; // epoch ms
  ms?: number; // duration for timed events
  detail?: string;
};

type Counters = Record<string, number>;

const RING_MAX = 200;
const SLOW_MS = 1200;

const ring: CacheEvent[] = [];
const counters: Counters = {};

function debugEnabled(): boolean {
  if (typeof document === "undefined") return false;
  if (import.meta.env?.DEV) return true;
  return document.documentElement.dataset.debugCache === "on";
}

function bump(key: string) {
  counters[key] = (counters[key] ?? 0) + 1;
}

/** Record a single cache event. Safe to call anywhere (SSR no-ops). */
export function recordCacheEvent(kind: CacheEventKind, scope: string, opts?: { ms?: number; detail?: string }) {
  if (typeof window === "undefined") return;
  const ev: CacheEvent = { kind, scope, at: Date.now(), ms: opts?.ms, detail: opts?.detail };
  ring.push(ev);
  if (ring.length > RING_MAX) ring.shift();
  bump(`${scope}.${kind}`);
  bump(kind);

  if (kind !== "slow" && typeof ev.ms === "number" && ev.ms >= SLOW_MS) {
    recordCacheEvent("slow", scope, { ms: ev.ms, detail: kind });
  }

  if (debugEnabled()) {
    const ms = ev.ms != null ? ` ${Math.round(ev.ms)}ms` : "";
    // eslint-disable-next-line no-console
    console.debug(`[cache:${scope}] ${kind}${ms}${ev.detail ? ` (${ev.detail})` : ""}`);
  }
}

/** Convenience: time an async refresh and record hit/miss + slow automatically. */
export async function timedRefresh<T>(scope: string, run: () => Promise<T>): Promise<T> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const out = await run();
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    recordCacheEvent("miss", scope, { ms });
    return out;
  } catch (err) {
    recordCacheEvent("refresh-failed", scope, { detail: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Hit ratio across all scopes (or a single scope), 0..1. */
export function cacheHitRatio(scope?: string): number {
  const hits = counters[scope ? `${scope}.hit` : "hit"] ?? 0;
  const misses = counters[scope ? `${scope}.miss` : "miss"] ?? 0;
  const total = hits + misses;
  return total === 0 ? 0 : hits / total;
}

/** Snapshot for debugging / dashboards. */
export function cacheMetricsSnapshot() {
  return {
    counters: { ...counters },
    hitRatio: cacheHitRatio(),
    recent: ring.slice(-50),
  };
}

// Expose a read-only debugging handle in the browser.
if (typeof window !== "undefined") {
  (window as unknown as { __cacheMetrics?: unknown }).__cacheMetrics = {
    snapshot: cacheMetricsSnapshot,
    hitRatio: cacheHitRatio,
  };
}
