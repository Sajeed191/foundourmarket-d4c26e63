/**
 * Infrastructure v2.0 — Silent health monitor.
 *
 * Runs only when the tab is visible AND the browser is idle. No polling.
 * Reports snapshot to callers on demand via getHealth().
 */

import { sendToSW } from "./sw-controller";

type Health = {
  swActive: boolean;
  cacheBuckets: number;
  approxBytes: number;
  lastCheckAt: number;
  status: "healthy" | "degraded" | "unknown";
};

let last: Health = {
  swActive: false,
  cacheBuckets: 0,
  approxBytes: 0,
  lastCheckAt: 0,
  status: "unknown",
};

export function getHealth(): Health { return { ...last }; }

async function runCheck(): Promise<void> {
  const diag = await sendToSW<{ ok: boolean; buckets?: Array<{ approxBytes: number }>; totalBytes?: number }>(
    { type: "DIAGNOSTICS" },
    3_000,
  );
  const swActive = !!diag?.ok;
  last = {
    swActive,
    cacheBuckets: diag?.buckets?.length ?? 0,
    approxBytes: diag?.totalBytes ?? 0,
    lastCheckAt: Date.now(),
    status: swActive ? "healthy" : "degraded",
  };
}

function scheduleIdle(cb: () => void): void {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => void };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 10_000 });
  else window.setTimeout(cb, 5_000);
}

let started = false;

export function startHealthMonitor(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  scheduleIdle(() => { void runCheck(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    // 30-minute floor between checks — battery friendly.
    if (Date.now() - last.lastCheckAt < 30 * 60 * 1000) return;
    scheduleIdle(() => { void runCheck(); });
  });
}
