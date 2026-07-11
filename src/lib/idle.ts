/**
 * Idle-time scheduling helpers (Phase 4D — Rendering & INP).
 *
 * Non-critical work triggered by a user interaction — analytics, personalization
 * events, telemetry, prefetch warming — should never run on the critical path of
 * that interaction. Running it synchronously (or as an eager microtask) before
 * the browser paints the interaction's visual response inflates INP and creates
 * long tasks on low-end Android.
 *
 * `runWhenIdle` defers a callback to `requestIdleCallback` when available, so the
 * browser paints the interaction first and does the background work in spare
 * time. It falls back to a short `setTimeout` where rIC is unsupported
 * (Safari/iOS, older WebViews) so behavior is identical everywhere — the work
 * still runs, just off the critical path. SSR-safe: on the server it runs the
 * callback synchronously so server code paths are unchanged.
 */

type IdleFn = () => void;

interface IdleDeadlineLike {
  didTimeout: boolean;
  timeRemaining: () => number;
}

type RequestIdleCallback = (
  cb: (deadline: IdleDeadlineLike) => void,
  opts?: { timeout: number },
) => number;

/**
 * Schedule non-critical work to run after the browser has had a chance to paint.
 * Errors in the callback are swallowed — background work must never break a UI
 * interaction. `timeout` guarantees the work eventually runs even on a busy main
 * thread (default 2s).
 */
export function runWhenIdle(fn: IdleFn, timeout = 2000): void {
  if (typeof window === "undefined") {
    // SSR / non-browser: keep the work synchronous so server paths are unchanged.
    try {
      fn();
    } catch {
      /* ignore */
    }
    return;
  }

  const run = () => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  };

  const ric = (window as unknown as { requestIdleCallback?: RequestIdleCallback })
    .requestIdleCallback;
  if (typeof ric === "function") {
    ric(run, { timeout });
  } else {
    // rIC unsupported — a small timeout still yields to paint before running.
    window.setTimeout(run, 1);
  }
}

/**
 * Run `fn` on the next frame *after* the current one commits, i.e. once the
 * browser has painted the interaction's immediate visual response. Use this for
 * follow-up work that should happen very soon but must not block the tap's
 * first paint. Falls back to a microtask off the main line where rAF is absent.
 */
export function runAfterPaint(fn: IdleFn): void {
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
    try {
      fn();
    } catch {
      /* ignore */
    }
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  });
}
