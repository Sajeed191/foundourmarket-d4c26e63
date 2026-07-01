/**
 * Render Telemetry Layer — orchestration-only diagnostics for the TwoPhaseGrid.
 *
 * Captures hydration/decode/scroll timings and exposes the last snapshot on
 * `window._GRID_DEBUG_`. Zero visual impact; logging is opt-in (see below) but
 * the snapshot is always recorded so it can be inspected from the console after
 * a refresh without needing a special URL.
 *
 * Enable console logging with `?debug-grid` in the URL or
 * `window.__DEBUG_GRID = true`.
 */

export type GridTelemetry = {
  /** performance.now() when Phase 1 (skeleton + warm) began. */
  hydrationStartTime: number;
  /** performance.now() when the first-batch decode loop started. */
  decodeBatchStart: number;
  /** performance.now() when the first-batch decode loop finished. */
  decodeBatchEnd: number;
  /** performance.now() when gridReady flipped true (atomic commit). */
  gridReadyTimestamp: number;
  /** How long the skeleton was visible, ms. */
  skeletonDurationMs: number;
  /** performance.now() of the first paint after the browser started (nav timing). */
  firstPaintTimestamp: number;
  /** Duration the scroll-stabilization lock stays active, ms. */
  scrollLockDurationMs: number;
  /** Viewport batch size K used for the decode barrier. */
  viewportBatchSize: number;
  /** How gridReady was reached. */
  committedVia: "decode-complete" | "safety-timeout" | "empty" | "instant";
  /** Rough device tier estimate. */
  devicePerfTier: "low" | "mid" | "high" | "unknown";
};

function firstPaint(): number {
  if (typeof performance === "undefined") return 0;
  try {
    const fp = performance.getEntriesByType("paint").find((e) => e.name === "first-paint");
    return fp ? Math.round(fp.startTime) : 0;
  } catch {
    return 0;
  }
}

function estimateTier(): GridTelemetry["devicePerfTier"] {
  if (typeof navigator === "undefined") return "unknown";
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  const mem = nav.deviceMemory ?? 0;
  const cores = nav.hardwareConcurrency ?? 0;
  if (!mem && !cores) return "unknown";
  if (mem && mem <= 4) return "low";
  if (cores && cores <= 4) return mem && mem >= 8 ? "mid" : "low";
  if (cores >= 8 || (mem && mem >= 8)) return "high";
  return "mid";
}

/** Write a telemetry snapshot to window._GRID_DEBUG_ (always safe). */
export function publishGridTelemetry(partial: Partial<GridTelemetry>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { _GRID_DEBUG_?: GridTelemetry };
  const defaults: GridTelemetry = {
    hydrationStartTime: 0,
    decodeBatchStart: 0,
    decodeBatchEnd: 0,
    gridReadyTimestamp: 0,
    skeletonDurationMs: 0,
    firstPaintTimestamp: firstPaint(),
    scrollLockDurationMs: 0,
    viewportBatchSize: 0,
    committedVia: "instant",
    devicePerfTier: estimateTier(),
  };
  w._GRID_DEBUG_ = { ...defaults, ...(w._GRID_DEBUG_ ?? {}), ...partial };
}

/** True when scroll is being restored (e.g. bfcache / refresh at offset). */
export function isScrollRestoring(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    const type = entries[0]?.type;
    // On reload/back-forward, the browser may restore a non-zero scroll offset.
    return (type === "reload" || type === "back_forward") && window.scrollY > 0;
  } catch {
    return false;
  }
}
