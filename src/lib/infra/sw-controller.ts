/**
 * Infrastructure v2.0 — Service Worker controller (client side).
 *
 * Owns:
 *   - Guarded registration of /sw.js (production, real domain, not iframe,
 *     not preview, not dev, not ?sw=off).
 *   - postMessage bridge with typed helpers used by chunk-recovery,
 *     deployment-recovery, health-monitor, and the admin diagnostics panel.
 *   - Falls through to unregister-and-wipe when guards refuse.
 *
 * Never touched: Infra v1.5 (request queue, resilient helpers), auth,
 * checkout, payments, silent-recovery v2, error boundary.
 */

const SW_URL = "/sw.js";

const ALLOWED_HOSTS = new Set<string>([
  "foundourmarket.com",
  "www.foundourmarket.com",
  "foundourmarket.lovable.app",
]);

function isPreviewHost(h: string): boolean {
  return (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev") ||
    h.endsWith(".lovable.dev")
  );
}

export function shouldRegisterSW(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false; // iframe
  } catch {
    return false;
  }
  const host = window.location.hostname;
  if (isPreviewHost(host)) return false;
  if (!ALLOWED_HOSTS.has(host)) return false;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) return registrationPromise;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return (registrationPromise = Promise.resolve(null));
  }
  return (registrationPromise = navigator.serviceWorker
    .getRegistration(SW_URL)
    .then((r) => r ?? null)
    .catch(() => null));
}

/**
 * Send a message to the active SW and await a typed reply via MessageChannel.
 * Resolves to null when there is no active SW or the SW never replies within
 * the timeout. Never throws — every caller can treat missing SW as no-op.
 */
export async function sendToSW<T = unknown>(
  message: Record<string, unknown>,
  timeoutMs = 4_000,
): Promise<T | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const sw = navigator.serviceWorker.controller;
  if (!sw) return null;
  return new Promise<T | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      try { channel.port1.close(); } catch { /* ignore */ }
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (ev) => {
      window.clearTimeout(timer);
      resolve((ev.data as T) ?? null);
    };
    try {
      sw.postMessage(message, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

async function unregisterEverything(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch { /* ignore */ }
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    } catch { /* ignore */ }
  }
}

let booted = false;

/**
 * Idempotent boot. On approved hosts registers /sw.js and wires the
 * SW_ACTIVATED broadcast. Everywhere else (preview, iframe, dev, disallowed
 * host, ?sw=off) it aggressively unregisters — matching today's
 * kill-switch behavior in src/lib/pwa.ts.
 *
 * Returns true when SW is (or will be) active, false when we fell through
 * to the unregister path. Callers can gate feature startup on the result.
 */
export async function bootServiceWorker(): Promise<boolean> {
  if (booted) return shouldRegisterSW();
  booted = true;

  if (!shouldRegisterSW()) {
    await unregisterEverything();
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    registrationPromise = Promise.resolve(reg);
    // Auto-update on natural navigation. Never force reload here — the
    // deployment-recovery module handles safe activation windows.
    reg.addEventListener("updatefound", () => { /* observed; no forced reload */ });
    return true;
  } catch {
    // Registration failed (server 5xx on /sw.js, opaque error). Fall back
    // to the safe unregister path so users are never stuck with a
    // half-registered worker.
    await unregisterEverything();
    return false;
  }
}

/** Escape hatch used by the admin diagnostics "Reset infrastructure" button. */
export async function killServiceWorker(): Promise<void> {
  await sendToSW({ type: "KILL" });
  await unregisterEverything();
}
