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

// Shared, persistent boot-attempt counter (also used by the pre-React inline
// recovery script in __root.tsx). Time-based cooldowns alone do NOT stop the
// reload loop seen on low-RAM Android devices: a renderer OOM crash reloads the
// tab (frequently wiping sessionStorage), so a time guard resets and recovery
// fires forever. A persistent COUNT in localStorage with a hard cap guarantees
// the loop terminates and a graceful error UI is shown instead.
const BOOT_KEY = "fom_boot_attempts";
const BOOT_WINDOW_MS = 60_000;
const BOOT_MAX_RELOADS = 2;

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
 * Guarded hard reload to recover from a stale-deploy chunk 404.
 *
 * Delegates to the pre-React recovery installed by the inline script in
 * __root.tsx (`window.__fomRecover`) so a single persistent counter governs
 * EVERY auto-reload path in the app — there is exactly one cap, no matter which
 * mechanism triggers first. Falls back to a self-contained capped reload if the
 * inline script is unavailable (e.g. SSR-less test harness).
 */
function attemptReloadRecovery(): void {
  if (typeof window === "undefined") return;

  const shared = (window as unknown as { __fomRecover?: () => void }).__fomRecover;
  if (typeof shared === "function") {
    shared();
    return;
  }

  // Fallback: persistent counter with hard cap (mirrors the inline script).
  let count = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(BOOT_KEY) || "null") as
      | { n: number; t: number }
      | null;
    if (raw && Date.now() - raw.t < BOOT_WINDOW_MS) count = raw.n;
    count += 1;
    localStorage.setItem(BOOT_KEY, JSON.stringify({ n: count, t: Date.now() }));
  } catch {
    /* storage blocked — proceed with a single reload */
  }
  if (count > BOOT_MAX_RELOADS) return; // give up; show whatever UI is present

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
