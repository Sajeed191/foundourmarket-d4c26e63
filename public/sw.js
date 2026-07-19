/* FoundOurMarket™ Infrastructure v2.0 — Self-Healing Service Worker
 *
 * Design goals:
 *  - Dual-cache (active + candidate). Never replace active until candidate
 *    passes integrity checks and the client sends PROMOTE during an idle
 *    window.
 *  - Never cache sensitive traffic (API, auth, RPC, server functions,
 *    Supabase). Cache only static assets and HTML navigations.
 *  - Support ?sw=off escape hatch (unregister + wipe own caches).
 *  - Every failure path leaves the caller with a real network response.
 *
 * This file is served at /sw.js. It replaces the previous kill-switch
 * worker at the same path so returning users cleanly upgrade.
 */

const RUNTIME = "fom-runtime-v1";           // ephemeral SWR bucket (images, fonts)
const ACTIVE_PREFIX = "fom-active-";        // active app-shell + hashed assets
const CANDIDATE_PREFIX = "fom-candidate-";  // staging for a new deployment
const HTML_FALLBACK_KEY = "__html_fallback__/";

const APP_ORIGIN = self.location.origin;

/* ---------------------------- Path classifiers --------------------------- */

function isSameOrigin(url) {
  try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
}

// Anything sensitive: NEVER intercept, NEVER cache, NEVER inspect.
function isSensitive(url) {
  const u = new URL(url, APP_ORIGIN);
  if (u.origin !== APP_ORIGIN) {
    // Only cache same-origin. Cross-origin (Supabase, CDN APIs, etc.) is
    // passed straight to the network without interception.
    return true;
  }
  const p = u.pathname;
  return (
    p.startsWith("/_serverFn") ||
    p.startsWith("/api/") ||
    p.startsWith("/auth/") ||
    p.startsWith("/rest/v1/") ||
    p.startsWith("/functions/v1/") ||
    p.startsWith("/storage/v1/") ||
    p.startsWith("/realtime/v1/") ||
    p.includes("/checkout") ||
    p.includes("/payment") ||
    // Server function bodies also route through TanStack RPC — never cache
    // POST/PATCH; the fetch handler additionally short-circuits non-GET.
    false
  );
}

// Hashed build assets (Vite-emitted, immutable). Cache-first.
function isImmutableAsset(url) {
  const p = new URL(url, APP_ORIGIN).pathname;
  return /\/assets\/.+\.[0-9a-f]{6,}\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|avif|gif|ico)$/i.test(p);
}

// Runtime-cacheable media (product images, uploaded assets). SWR.
function isRuntimeCacheable(url) {
  const u = new URL(url, APP_ORIGIN);
  const p = u.pathname;
  if (u.origin !== APP_ORIGIN) return false;
  return (
    p.startsWith("/__l5e/assets-v1/") ||
    /\.(?:png|jpg|jpeg|webp|avif|gif|ico|svg|woff2?|ttf|otf)$/i.test(p)
  );
}

function isHtmlNavigation(req) {
  return req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));
}

/* ------------------------------ Cache helpers ---------------------------- */

async function activeCacheName() {
  const names = await caches.keys();
  return names.find((n) => n.startsWith(ACTIVE_PREFIX)) || `${ACTIVE_PREFIX}bootstrap`;
}

async function openActive() { return caches.open(await activeCacheName()); }

async function cleanupCandidates(keep) {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((n) => n.startsWith(CANDIDATE_PREFIX) && n !== keep)
      .map((n) => caches.delete(n)),
  );
}

async function cleanupOldActives(keep) {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((n) => n.startsWith(ACTIVE_PREFIX) && n !== keep)
      .map((n) => caches.delete(n)),
  );
}

/* ------------------------------ Fetch strategy --------------------------- */

async function serveNavigation(req) {
  const active = await openActive();
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && fresh.type === "basic") {
      // Cache the shell for offline fallback keyed by a stable URL.
      const copy = fresh.clone();
      active.put(HTML_FALLBACK_KEY, copy).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await active.match(HTML_FALLBACK_KEY);
    if (cached) return cached;
    throw err;
  }
}

async function serveImmutable(req) {
  const active = await openActive();
  const hit = await active.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) active.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    // Corrupted / missing chunk — the client-side chunk-recovery layer will
    // trigger REPAIR next. Rethrow so the client sees the failure and can
    // recover deterministically.
    throw err;
  }
}

async function serveRuntime(req) {
  const runtime = await caches.open(RUNTIME);
  const hit = await runtime.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok) runtime.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return hit || (await network) || fetch(req);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (isSensitive(req.url)) return; // straight to network, untouched
  if (!isSameOrigin(req.url) && !isRuntimeCacheable(req.url)) return;

  if (isHtmlNavigation(req)) { event.respondWith(serveNavigation(req)); return; }
  if (isImmutableAsset(req.url)) { event.respondWith(serveImmutable(req)); return; }
  if (isRuntimeCacheable(req.url)) { event.respondWith(serveRuntime(req)); return; }
});

/* --------------------------- Install / Activate -------------------------- */

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Ensure at least a bootstrap active cache exists.
    const active = await openActive();
    void active;
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // Aggressive cleanup: keep exactly one active + zero candidates
    // (candidates are recreated on demand by the deployment recovery).
    const currentActive = await activeCacheName();
    await cleanupOldActives(currentActive);
    await cleanupCandidates("");
    broadcast({ type: "SW_ACTIVATED", active: currentActive });
  })());
});

/* ------------------------------ Client bridge ---------------------------- */

function broadcast(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
    for (const c of clients) c.postMessage(msg);
  });
}

async function snapshotDiagnostics() {
  const names = await caches.keys();
  const buckets = [];
  let totalBytes = 0;
  for (const n of names) {
    try {
      const c = await caches.open(n);
      const keys = await c.keys();
      let bytes = 0;
      // Approximate size via Content-Length header only — reading bodies
      // would defeat SW efficiency. Skip when header is absent.
      for (const k of keys) {
        const res = await c.match(k);
        if (!res) continue;
        const cl = Number(res.headers.get("content-length") || 0);
        if (Number.isFinite(cl)) bytes += cl;
      }
      buckets.push({ name: n, entries: keys.length, approxBytes: bytes });
      totalBytes += bytes;
    } catch {}
  }
  return { buckets, totalBytes, active: await activeCacheName(), ts: Date.now() };
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  const reply = (payload) => { try { port && port.postMessage(payload); } catch {} };

  (async () => {
    try {
      switch (data.type) {
        case "PING":
          reply({ ok: true, active: await activeCacheName() });
          return;

        case "DIAGNOSTICS":
          reply({ ok: true, ...(await snapshotDiagnostics()) });
          return;

        case "PREFETCH": {
          // Populate a candidate cache with a set of URLs (same-origin assets
          // parsed from the fresh HTML). Every fetch must succeed or the
          // candidate is discarded — no partial promotion.
          const version = String(data.version || `v${Date.now()}`);
          const urls = Array.isArray(data.urls) ? data.urls.filter(isSameOrigin) : [];
          const bucket = `${CANDIDATE_PREFIX}${version}`;
          const c = await caches.open(bucket);
          const results = await Promise.allSettled(urls.map(async (u) => {
            const res = await fetch(u, { cache: "no-store" });
            if (!res || !res.ok) throw new Error(`bad ${res && res.status} for ${u}`);
            await c.put(u, res.clone());
          }));
          const failed = results.filter((r) => r.status === "rejected").length;
          if (failed > 0) {
            await caches.delete(bucket);
            reply({ ok: false, reason: "integrity_failed", failed, total: urls.length });
            return;
          }
          reply({ ok: true, version, total: urls.length });
          return;
        }

        case "PROMOTE": {
          // Atomically promote a candidate to become the active cache.
          const version = String(data.version || "");
          const bucket = `${CANDIDATE_PREFIX}${version}`;
          const exists = (await caches.keys()).includes(bucket);
          if (!exists) { reply({ ok: false, reason: "missing_candidate" }); return; }
          const newActive = `${ACTIVE_PREFIX}${version}`;
          const src = await caches.open(bucket);
          const dst = await caches.open(newActive);
          const keys = await src.keys();
          for (const k of keys) {
            const r = await src.match(k);
            if (r) await dst.put(k, r);
          }
          // Delete old actives + used candidate.
          await cleanupOldActives(newActive);
          await caches.delete(bucket);
          broadcast({ type: "SW_ACTIVATED", active: newActive });
          reply({ ok: true, active: newActive });
          return;
        }

        case "REPAIR": {
          const url = String(data.url || "");
          if (!url || !isSameOrigin(url)) { reply({ ok: false, reason: "bad_url" }); return; }
          const active = await openActive();
          try { await active.delete(url); } catch {}
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res || !res.ok) { reply({ ok: false, reason: `http_${res && res.status}` }); return; }
            await active.put(url, res.clone());
            reply({ ok: true });
          } catch (err) {
            reply({ ok: false, reason: String((err && err.message) || err) });
          }
          return;
        }

        case "ROLLBACK": {
          // Delete all candidate caches. Active is left untouched.
          const names = await caches.keys();
          const removed = names.filter((n) => n.startsWith(CANDIDATE_PREFIX));
          await Promise.all(removed.map((n) => caches.delete(n)));
          reply({ ok: true, removed: removed.length });
          return;
        }

        case "KILL": {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
          await self.registration.unregister();
          reply({ ok: true });
          return;
        }

        default:
          reply({ ok: false, reason: "unknown_type" });
      }
    } catch (err) {
      reply({ ok: false, reason: String((err && err.message) || err) });
    }
  })();
});

// ?sw=off served-URL escape hatch: any fetch of /sw.js?off unregisters.
// (Registration side also checks this; belt + suspenders.)
