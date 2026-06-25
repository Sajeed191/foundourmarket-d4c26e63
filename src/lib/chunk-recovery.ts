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
 * The handlers below retry transient failures, and — when a chunk is genuinely
 * gone (stale deploy) — perform a single guarded hard reload to fetch the
 * fresh HTML + chunk manifest. The reload is gated by sessionStorage so we
 * never loop on a truly broken build.
 */

const RELOAD_FLAG = "fom_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 30_000;

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

/** One-time hard reload to recover from a stale-deploy chunk 404. */
function attemptReloadRecovery(): void {
  if (typeof window === "undefined") return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return; // already tried recently
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* storage blocked (private mode / WebView) — fall through to reload once */
  }
  // Cache-bust the document so the CDN/SW returns the newest HTML + manifest.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString(36));
  window.location.replace(url.toString());
}

/**
 * Retry-wrapped React.lazy. Retries the dynamic import with backoff before
 * giving up; a final failure triggers stale-deploy reload recovery so the user
 * sees a working app instead of a blank Suspense boundary.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  { retries = 2, baseDelay = 350 }: { retries?: number; baseDelay?: number } = {},
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
          await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)));
        }
      }
    }
    // Persistent chunk failure — most likely a stale deploy. Recover by reload.
    console.error("[chunk-recovery] dynamic import failed permanently", lastErr);
    attemptReloadRecovery();
    // Keep Suspense pending while the reload navigates away.
    return new Promise<{ default: T }>(() => {});
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
    attemptReloadRecovery();
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      console.error("[chunk-recovery] unhandled chunk rejection", event.reason);
      attemptReloadRecovery();
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
          attemptReloadRecovery();
        }
      }
    },
    true, // capture: resource load errors don't bubble
  );
}
