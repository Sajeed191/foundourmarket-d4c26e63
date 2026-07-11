# Phase 4 — Performance & Scalability

Goal: make the catalog fast and scalable without touching the variant system, checkout, PDP correctness, SEO, or accessibility. Delivered in verifiable sub-phases (4A–4F), each shipped and checked before the next — the same low-risk cadence as Phases 1–3.

## Baseline (measured today)

- **Catalog is the #1 win.** The homepage/browse list currently fetches ~72 columns per card via `LIST_SELECT_COLS`. For 48 products that is **126.7 KB**; a true card-only projection (15 fields) is **28.2 KB** — a **78% payload cut**, already beating the 40–60% target.
- Published catalog size: **158 products**.
- Homepage runtime (dev build, mobile 393px): FCP ~972 ms, CLS 0, ~250 requests. Production numbers will be captured against the published build as the official baseline before/after each sub-phase.
- Existing groundwork to build on (not rebuild): `products_public` view, `LIST_SELECT_COLS` vs `SELECT_COLS`, `VirtualizedProductGrid`, `AdaptiveProductMedia`, `LazyMount`, `ProductSkeleton`, `__lean` marker on Product.

## Success criteria (mobile)

- Lighthouse ≥ 90, LCP < 2.5 s, INP < 200 ms, CLS < 0.1, TBT trending down.
- Initial catalog payload reduced ≥ 40–60% (target ~78% via card projection).
- Smooth scroll on 2 GB / 4 GB / 8 GB Android where feasible.
- Zero regressions: schema, checkout/payment, variants, PDP data, SEO, a11y.

---

## 4A — Catalog API optimization (highest ROI)

- Add a dedicated **card projection** constant `CARD_SELECT_COLS` (slug, name, price + regional prices/compare, rating, reviews, image, in_stock, discount, region visibility, featured, plus the few merchandising flags the cards/badges actually render).
- Point list fetchers (`useProducts`/homepage/browse/section carousels) at the card projection; keep `__lean=true` so any detail-only field access is a no-op until PDP refetch.
- Keep `SELECT_COLS` (full) exclusively on the PDP (`products.$slug.tsx`) and admin. Full backward compatibility — same `Product` shape, detail fields simply arrive on PDP.
- Verify: re-measure list payload (expect ~28 KB/48), confirm cards + badges + region pricing render identically.

## 4B — Image pipeline

- Responsive `srcset`/`sizes` + explicit width/height (or aspect-ratio box) on every card image to lock CLS.
- WebP/AVIF where the source/CDN supports it, with graceful fallback to the original.
- Blur/skeleton placeholder → fade-in; native `loading="lazy"` + `decoding="async"` for below-the-fold thumbnails; eager + `fetchpriority="high"` only for the LCP hero.
- **Robustness**: automatic fallback image on error, integrity check for missing/empty URLs, and gallery self-healing (skip broken entries) on the PDP.
- Prefetch only the *likely next* images (next carousel page / next-in-viewport), not the whole list.

## 4C — Caching strategy

- Cache headers for public catalog reads (browser + CDN) with `stale-while-revalidate` for card lists.
- Route `staleTime`/`gcTime` tuning so re-navigation doesn't refetch static catalog data.
- Explicit **cache invalidation** after product/admin edits so the storefront never serves stale cards (query invalidation + versioned key).

## 4D — Rendering performance

- Trim unnecessary re-renders (memoize card rows, stabilize callbacks/props, split context reads).
- Confirm/extend virtualization + incremental mount for long grids; smooth infinite scroll with an IntersectionObserver sentinel.
- Keep main-thread work chunked to protect INP/60 FPS on low-end Android.

## 4E — Database / query optimization

- Ensure the card projection maps to indexed filter/sort columns (status, region visibility, homepage/category position, created_at); add targeted indexes only where `EXPLAIN ANALYZE` shows a real cost (plain `CREATE INDEX` via migration).
- Paginate heavy admin product queries; eliminate any N+1 (batch image/variant lookups).
- No schema-breaking changes; migrations are additive.

## 4F — Production monitoring

- Client Web Vitals (LCP, INP, CLS, TTFB) reporting.
- Slow API/query logging, image-load-failure counter, JS error capture, and checkout/payment timing + failure events.
- Lightweight, sampled, and privacy-safe (no PII); surfaced for admins.

---

## Safety checklist (every sub-phase)

- `tsgo` clean; no build/runtime errors.
- Products **without** variants and **with** variants both render and check out.
- Cart, checkout, orders, invoices, inventory reservations unchanged.
- SEO: PDP metadata, `product-feed.xml`, canonical/OG intact.
- A11y: alt text, focus, contrast preserved.
- Before/after metrics recorded against the published build.

## Sequencing

4A (biggest, safest win) → 4B → 4C → 4D → 4E → 4F. Later roadmap items (Search/Recommendation intelligence, SEO & caching deep-dive, AI personalization, inventory analytics dashboard, "Continue Shopping" intelligence) stay as follow-on phases after this performance foundation lands.

## Technical notes

- 4A is pure frontend/query-shape: new `CARD_SELECT_COLS`, fetcher wiring, no schema change — fastest to ship and verify.
- 4E is the only sub-phase that may add DB objects; all additive indexes, validated with `EXPLAIN ANALYZE`, run via the migration tool for approval.
- Monitoring (4F) uses a `createServerFn`/public route ingestion endpoint; no third-party SDK required.

---

## Progress log

### 4A — Catalog API optimization ✅ (done)
- Added `CARD_SELECT_COLS` (51 cols) used only by browsing grids via `fetchProducts()`. Drops `description` (largest field), non-COD payment flags, and logistics/scheduling/positioning columns.
- Kept `cod_enabled` + shipping fees in CARD because the cart reads products from the same `useProducts` cache and checkout needs them.
- QuickView and Compare now lazy-fetch `description` on demand so those surfaces are unchanged.
- Cart/checkout, PDP (full `SELECT_COLS`), recommendations, returns all keep the richer projections.
- **Measured: 48-card list payload 126.7 KB → 66.5 KB (~48% smaller).** tsgo clean; grid, PDP, and detail verified in-browser with no runtime errors.
- Behavior change (minor): client `SearchCommand` no longer substring-matches on product `description` (still matches name/brand/tagline/category).
