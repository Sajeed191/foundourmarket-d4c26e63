/**
 * Perf v3 — shared scroll/resize broadcaster.
 *
 * Consolidates window `scroll` and `resize` (+ `visualViewport.resize` +
 * `orientationchange`) listeners into ONE per event type, rAF-batched, with a
 * cached `window.scrollY`. Consumers subscribe with a callback and get the
 * cached value per frame instead of registering their own listener.
 *
 * Behaviour rules (must match legacy per-component listeners):
 *   - Scroll callbacks run inside a single rAF, at most once per frame.
 *   - Resize callbacks run inside a single rAF (coalesces bursts).
 *   - Passive scroll listener; never preventDefault.
 *   - Callbacks are wrapped in try/catch so a throwing subscriber cannot
 *     starve siblings.
 *   - No SSR side effects — everything is gated on `typeof window`.
 *
 * Consumers that need their own timing (e.g. velocity math with
 * performance.now, IntersectionObserver, etc.) should keep their existing
 * implementation — the bus is only for callers whose sole need is
 * "run something after a scroll/resize on the next frame."
 */

type ScrollListener = (y: number) => void;
type ResizeListener = () => void;

const scrollSubs = new Set<ScrollListener>();
const resizeSubs = new Set<ResizeListener>();

let scrollRaf = 0;
let resizeRaf = 0;
let cachedY = 0;
let installed = false;

function flushScroll() {
  scrollRaf = 0;
  cachedY = typeof window !== "undefined" ? window.scrollY : 0;
  for (const fn of scrollSubs) {
    try {
      fn(cachedY);
    } catch {
      /* isolate subscriber failures */
    }
  }
}

function flushResize() {
  resizeRaf = 0;
  for (const fn of resizeSubs) {
    try {
      fn();
    } catch {
      /* isolate subscriber failures */
    }
  }
}

function scheduleScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(flushScroll);
}

function scheduleResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(flushResize);
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  cachedY = window.scrollY;
  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", scheduleResize, { passive: true });
  window.addEventListener("orientationchange", scheduleResize, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleResize);
}

/**
 * Subscribe to shared scroll events. Callback receives the cached
 * `window.scrollY`, once per animation frame at most.
 * Returns an unsubscribe function.
 */
export function onScroll(fn: ScrollListener): () => void {
  install();
  scrollSubs.add(fn);
  return () => {
    scrollSubs.delete(fn);
  };
}

/**
 * Subscribe to shared resize events (window resize, orientation change,
 * visualViewport resize). Coalesced through rAF.
 */
export function onResize(fn: ResizeListener): () => void {
  install();
  resizeSubs.add(fn);
  return () => {
    resizeSubs.delete(fn);
  };
}

/** Best-effort read of the last cached scroll position. */
export function getCachedScrollY(): number {
  return cachedY;
}
