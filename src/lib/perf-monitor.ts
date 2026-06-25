/**
 * Lightweight runtime performance monitor for diagnosing jank on low-end
 * devices. Dev-only by default: it observes long tasks, samples frame rate,
 * and checks JS heap pressure, logging concise warnings when thresholds trip.
 * Zero cost in production builds.
 */

let started = false;

export function startPerfMonitoring(): void {
  if (started || typeof window === "undefined") return;
  if (!import.meta.env.DEV) return;
  started = true;

  // 1. Long tasks (>50ms block the main thread → dropped frames / input lag).
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 50) {
          // eslint-disable-next-line no-console
          console.warn(
            `[perf] long task ${Math.round(entry.duration)}ms`,
            (entry as PerformanceEntry & { attribution?: unknown }).attribution ?? "",
          );
        }
      }
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch {
    /* longtask unsupported */
  }

  // 2. FPS sampling — flag sustained drops below 40fps (visible jank).
  let frames = 0;
  let last = performance.now();
  const tick = (now: number) => {
    frames++;
    if (now - last >= 1000) {
      const fps = Math.round((frames * 1000) / (now - last));
      if (fps < 40) {
        // eslint-disable-next-line no-console
        console.warn(`[perf] low FPS: ${fps}`);
      }
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // 3. Memory pressure — sample heap usage periodically.
  const mem = (performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  if (mem) {
    setInterval(() => {
      const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
      if (ratio > 0.85) {
        // eslint-disable-next-line no-console
        console.warn(
          `[perf] high heap usage: ${(ratio * 100).toFixed(0)}% ` +
            `(${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB)`,
        );
      }
    }, 10000);
  }
}
