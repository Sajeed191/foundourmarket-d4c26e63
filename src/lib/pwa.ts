// Manifest-only PWA: the app is installable (Add to Home Screen, standalone
// display, themed status bar) but we deliberately do NOT register a service
// worker. Service workers caused stale shells in the hosted preview iframe.
//
// This helper actively unregisters any service worker that was registered by
// a previous build, so returning users get a clean state.
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((r) => r.unregister().catch(() => {}));
    })
    .catch(() => {});

  // Best-effort cache cleanup from any prior caching SW.
  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {});
  }
}

/** Detect whether the app is running in installed/standalone PWA mode. */
export function isStandalonePWA() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
