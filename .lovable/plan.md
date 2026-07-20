# Performance Optimization v3 — Frontend Only

## Guardrails
- No backend, DB, Supabase, auth, orders/payments/inventory/coupons/returns/business logic changes.
- No feature/UX changes. Same DOM output, same data, same URLs.
- Every change must be reversible and observable in a profiler.

## Method (measure → target → verify)
1. **Profile first.** Build a lightweight bottleneck report from source: identify (a) routes >800 LOC, (b) components mounted on every page, (c) `useEffect`/subscription counts, (d) list renderers without `React.memo`, (e) inline object/array props in list items, (f) unbounded queries in loaders. Skip broad rewrites; only touch the top offenders.
2. **Fix in narrow passes.** After each pass, confirm typecheck + a visual smoke on Home / PDP / Admin Orders Ops / Admin Products.
3. **Verify.** Compare before/after: React Profiler commit counts on target pages, scroll FPS via `requestAnimationFrame` sampler, LCP/INP via `web-vitals` in dev overlay (already present if wired; otherwise skip).

## Scope (in priority order)

### Pass 1 — Global render hygiene (biggest ROI)
- `ProductCard` and related list items → wrap in `React.memo` with a shallow-safe props contract; hoist static style objects; stabilize event handlers via `useCallback` in parents.
- Homepage sections: memoize section headings + product grids; ensure `useMemo` deps are minimal (already partially done for badge filters).
- Kill inline arrow-prop churn on hot lists (Home grid, Search grid, Admin Products table, Admin Orders Ops table).
- Audit context providers that update on every render (cart, chat presence, floating stack) — split state so consumers only re-render on the slice they use.

### Pass 2 — Scroll / event listeners
- Consolidate scroll/resize listeners into a single passive `rAF`-throttled observer (LiveChat, FloatingContextObserver, sticky headers, RevealOnScroll). Ensure `{ passive: true }` everywhere.
- Replace any `getBoundingClientRect` reads inside scroll handlers with cached values on layout events only.
- `IntersectionObserver` for RevealOnScroll and lazy sections instead of scroll math.

### Pass 3 — Data fetching dedupe & caching
- Confirm all product/list reads go through TanStack Query with sensible `staleTime` (product lists: 60s; catalog metadata: 5m). Remove any `useEffect`+fetch duplicates.
- Ensure `useProducts`, `useBadgeCatalog`, `useFlashDeals` share a single query key per param set (no duplicated network calls per section).
- Debounce search inputs (Admin + storefront) to 250ms; throttle filter chip toggles to `requestIdleCallback` where safe.

### Pass 4 — Long lists (Admin)
- Virtualize tables >100 rows: Admin Products, Admin Orders, Admin Orders Ops, Admin Customers, Admin Support, Admin Email Queue. Use `@tanstack/react-virtual` (already in TanStack ecosystem; add if missing). Preserve current row markup, sticky header, and selection.
- Paginated fetches: cap page size (50) where a route currently loads all rows.

### Pass 5 — Route-level code splitting
- Verify heavy admin routes are code-split (TanStack auto-split is on). Ensure no route file re-exports a component (breaks splitting).
- Lazy-load heavy modals: `ProductEditorModal` (1.5k LOC), `CategoryAdminSheet`, `VariantImagesSection`, `ProductReviews`, `MobileFilterDrawer` via `React.lazy` + `Suspense` with a skeleton.
- Move debug-only modules (e.g. `debug-flags.ts` if imported at root) behind a dynamic import gated on `import.meta.env.DEV` or an admin flag.

### Pass 6 — Images
- Confirm every `<img>` on grids has `loading="lazy"`, `decoding="async"`, explicit `width`/`height` (or aspect-ratio) to prevent CLS.
- Only the LCP hero image gets `fetchpriority="high"` + `<link rel="preload">` in the route `head()`.
- Add `sizes` attribute on responsive product images so the browser picks the right srcset entry.

### Pass 7 — Animations
- Audit all keyframes/transitions; restrict to `transform` and `opacity`. Replace `width`/`height`/`box-shadow`/`filter: blur()` animations with transform/opacity + prerendered shadow layers.
- Wrap all decorative motion in `@media (prefers-reduced-motion: reduce)` disables (verify existing coverage).
- Ensure animated elements have `will-change: transform` only while animating; remove after.

### Pass 8 — Bundle
- Run `bun run build` and inspect chunk sizes; remove unused deps flagged by import graph (source-only, no functional change).
- Convert any static `import` of an admin-only utility from a customer route into a dynamic import.

## Technical notes
- Keep patches surgical. No mass reformatting.
- Do not introduce new global state libraries.
- `React.memo` on components with function/object props requires stable references from the parent — always paired.
- Virtualization must preserve keyboard navigation, row selection, and CSV export flows already present.
- Verification per pass: `bun run build` (or typecheck) + open Home, PDP, Admin Orders Ops, Admin Products, Search in the preview.

## Deliverable per pass
- List of files changed
- 1-line rationale per change
- Confirm: build green, no visible UX regression on the 5 smoke pages.

## Out of scope
- Any behavior change, copy change, or layout redesign.
- SW/cache/infra tweaks (Infrastructure v2.0 is frozen).
- Backend query changes.

---

**Ask before I start:** Should I execute all 8 passes in one go, or ship one pass per turn (recommended so you can review and snapshot each)?
