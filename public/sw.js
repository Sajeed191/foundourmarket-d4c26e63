// Kill-switch service worker: unregisters any previously-installed SW,
// clears caches, and reloads open clients. Keep this file in place for
// at least one release cycle so returning visitors get cleaned up.
self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      await self.clients.claim();
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(
        clients.map((c) => {
          try {
            const url = new URL(c.url);
            url.searchParams.set("sw-cleanup", Date.now().toString());
            return c.navigate(url.toString());
          } catch {
            return Promise.resolve();
          }
        })
      );
      await self.registration.unregister();
    })()
  )
);
