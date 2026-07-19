# Infrastructure v2.0 — Implementation Plan

## Non-negotiable safety rails

1. **Registration guards (same as PWA skill).** SW registers ONLY when ALL are true:
   - `import.meta.env.PROD`
   - not in iframe (`window.self === window.top`)
   - hostname is `foundourmarket.com`, `www.foundourmarket.com`, or `foundourmarket.lovable.app`
   - not `?sw=off` in URL
   - `getFlag("serviceWorker") && getFlag("pwa")` still respected
   
   In every other context the existing kill-switch behaviour (`unregister + caches.delete`) runs unchanged. Preview iframes, `id-preview--*`, `lovable.dev`, dev — never register.

2. **Current `public/sw.js` is a kill-switch.** Replace it with the self-healing SW at the same path so returning users cleanly upgrade. Add `?sw=off` handler at the top of the new SW that also unregisters (escape hatch).

3. **`registerServiceWorker()` in `src/lib/pwa.ts` is unchanged.** I add a new controller `src/lib/infra/sw-controller.ts` that runs in parallel and takes precedence only when guards pass. If any of them fail we fall through to today's unregister path — production behaviour today is preserved as the safe default.

## Architectural shortcuts (pragmatic)

- **No build-time precache manifest.** Deployment detection = periodic `HEAD /` + ETag/`last-modified` comparison, OR fetch `/` and parse `<link rel="modulepreload">` + `<script type="module" src>` on version bump. Avoids modifying `vite.config.ts` or adding `vite-plugin-pwa` (which would enlarge the plan by an order of magnitude and touch build config).
- **Two cache buckets:** `fom-active-v<hash>` (serve traffic) and `fom-candidate-v<hash>` (staging). Promotion = SW receives `{ type: "ACTIVATE_CANDIDATE" }` from client during idle window.
- **Chunk recovery v2** replaces the transient retry in `src/lib/chunk-recovery.ts` — v1 stays as final fallback (one hard reload) untouched. New layer: catch `ChunkLoadError`/`TypeError: Failed to fetch dynamically imported module`, message SW to redownload the exact URL bypassing cache, retry the `import()`, only then fall back to v1.
- **No polling.** Health monitor uses `visibilitychange` + `requestIdleCallback` (30-min minimum spacing). Deployment check on same trigger.

## File list

New:
- `public/sw.js` — replace kill-switch with self-healing SW (dual-cache, integrity validation, rollback, chunk repair, offline fallback for cached routes, `?sw=off` respected). No new deps.
- `src/lib/infra/sw-controller.ts` — guarded registration, `postMessage` client bridge, diagnostics read.
- `src/lib/infra/chunk-recovery-v2.ts` — window error listener, retry-with-repair flow.
- `src/lib/infra/deployment-recovery.ts` — idle-triggered version check + candidate promotion (never during `/checkout`, `/auth`, `/account/support/ticket/*`, or when a form is dirty).
- `src/lib/infra/health-monitor.ts` — orchestrates checks on idle+visible.
- `src/lib/infra/sw-diagnostics.ts` — typed message helpers for admin panel.
- `src/components/admin/InfraDiagnosticsPanel.tsx` — admin-only UI.
- `src/routes/admin.infrastructure.tsx` — admin route (gated by existing admin layout / has_role check).

Modified:
- `src/lib/infra/index.ts` — `bootInfra()` also boots controller + chunk-recovery-v2 + health monitor (all lazy, all idle-gated).
- `src/lib/pwa.ts` — unchanged behaviour; new controller runs before it in `__root.tsx` and short-circuits the unregister if it decides to register.
- `src/routes/__root.tsx` — 1-line change: swap `registerServiceWorker()` for `bootSWv2()` which internally decides register-or-unregister.

Never touched: checkout routes, auth routes, request-queue, resilient-* helpers, Silent Recovery v2, `AppErrorBoundary`, sync-toasts, order/payment code.

## Activation-safe route list

Deployment activation blocked (deferred until safe) when path matches:
`/checkout*`, `/auth*`, `/account/support/ticket/*` (active conversation), or `document.querySelector("form :invalid, [contenteditable=true]:focus, input:focus, textarea:focus")` returns anything, or `navigator.userActivation.isActive`.

## Admin diagnostics

Under `/admin/infrastructure`, gated with existing admin `has_role("admin")` check (uses the same guard as other admin pages — I'll copy the pattern from a sibling admin route).

## What I will NOT do

- Add `vite-plugin-pwa` (would need `vite.config.ts` change + build integration; out of scope this turn).
- Precache anything at install time (would require a build manifest). All caching is fetch-triggered.
- Change any Infra v1.5 file.
- Add a service worker to preview / dev / iframe / lovable.dev.

## Quality gate

After build I'll: (1) typecheck, (2) run a Playwright script hitting `http://localhost:8080` to confirm the guards refuse to register on localhost (dev), (3) verify `bootInfra()` still boots v1.5 unchanged, (4) verify the admin route compiles behind the auth gate.
