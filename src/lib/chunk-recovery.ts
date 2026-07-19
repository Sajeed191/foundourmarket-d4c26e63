import { lazy } from "react";
import type { ComponentType } from "react";

/**
 * Startup & asset-loading resilience for low-end / flaky-network devices.
 *
 * Two distinct failures cause the "random blank screen", "gray sad-face", or
 * "raw HTML with no styling" reports on older Android (slow 3G/4G, small RAM,
 * stale WebView caches):
 *
 *  1. A JS/CSS chunk request fails mid-load (network drop) → the dynamic
 *     import rejects and the route/component never mounts.
 *  2. After a new deploy, a tab that loaded the old HTML references hashed
 *     chunk URLs that now 404 on the CDN → every navigation/preload throws.
 *
 * The handlers below retry transient failures, but they never hard-reload the
 * page. On Android devices with strict network protection or renderer pressure,
 * reload-based recovery can become a black-screen blink loop. Persistent
 * failures are logged and converted into a graceful fallback instead.
 */

function isChunkLoadError(reason: unknown): boolean {
  const msg =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : "";
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg)
  );
}

/**
 * Report a persistent chunk failure without navigating. A blocked/failed module
 * should surface as diagnostics + fallback UI, not as an automatic reload.
 */
function reportChunkFailure(reason: unknown): void {
  if (typeof window === "undefined") return;

  const shared = (window as unknown as { __fomRecover?: (reason?: unknown) => void }).__fomRecover;
  if (typeof shared === "function") {
    shared(reason);
    return;
  }

  console.error("[chunk-recovery] automatic reload blocked after chunk failure", reason);
}

/**
 * Retry-wrapped React.lazy. Retries the dynamic import with backoff before
 * giving up; a final failure triggers stale-deploy reload recovery so the user
 * sees a working app instead of a blank Suspense boundary.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  { retries = 3, baseDelay = 1000 }: { retries?: number; baseDelay?: number } = {},
) {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastErr = err;
        if (!isChunkLoadError(err)) throw err;
        if (attempt < retries) {
          // Exponential backoff with a small jitter so a flaky network / a
          // deploy mid-flight gets several spaced-out chances to succeed.
          const delay = baseDelay * 2 ** attempt + Math.random() * 150;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    // Persistent failure of a NON-critical lazy slot (admin toolbar, live chat,
    // compare tray, install prompt, …). These are deferred, post-hydration
    // widgets — a permanent failure here must never take down the whole app or
    // trigger a recovery reload. Log for telemetry and render nothing.
    console.error("[chunk-recovery] non-critical dynamic import failed permanently", lastErr);
    return { default: (() => null) as unknown as T };
  });
}

let installed = false;

/**
 * Installs global listeners that catch chunk-load failures escaping Vite's
 * preloader and the router (e.g. preload-on-intent), logging them and
 * triggering one guarded reload when a stale deploy is detected.
 */
export function installChunkRecovery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Vite emits this when a `<link rel=modulepreload>` / dynamic import 404s.
  window.addEventListener("vite:preloadError", (event) => {
    console.error("[chunk-recovery] vite:preloadError", (event as Event & { payload?: unknown }).payload);
    event.preventDefault?.();
    reportChunkFailure((event as Event & { payload?: unknown }).payload);
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      console.error("[chunk-recovery] unhandled chunk rejection", event.reason);
      event.preventDefault?.();
      reportChunkFailure(event.reason);
    }
  });

  // Failed <script>/<link> element loads (CSS bundle, classic chunk).
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "SCRIPT" || tag === "LINK") {
        const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || "";
        if (/\/assets\/.*\.(js|css)/i.test(src)) {
          console.error("[chunk-recovery] asset element failed to load", src);
          reportChunkFailure(src);
        }
      }
    },
    true, // capture: resource load errors don't bubble
  );
}
