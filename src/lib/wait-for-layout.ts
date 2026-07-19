/**
 * Poll via requestAnimationFrame until the layout metrics needed by floating
 * widgets are actually available (specifically --app-header-height, published
 * by LayoutMetricsProvider). Falls through after `maxFrames` so we never wait
 * forever — the widget will then place using whatever value exists (worst
 * case: the CSS fallback in getBounds()).
 *
 * Returns a cancel function.
 */
export function waitForLayoutReady(
  ready: () => boolean,
  done: (ok: boolean) => void,
  maxFrames = 30,
): () => void {
  let cancelled = false;
  let raf = 0;
  let frames = 0;
  const tick = () => {
    if (cancelled) return;
    if (ready()) {
      done(true);
      return;
    }
    if (++frames >= maxFrames) {
      done(false);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

/**
 * True once the sticky header has published a non-zero, finite height into
 * --app-header-height. Safe to call on the server (returns false).
 */
export function isHeaderLayoutReady(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-header-height")
    .trim();
  if (!raw) return false;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0;
}
