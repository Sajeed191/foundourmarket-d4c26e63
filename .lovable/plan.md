# Phase 4D — Rendering & INP Optimization

## What already exists (verified in code)

Much of Phase 4D was already built during Phases 4A–4C. I confirmed:

- **Virtualized grids** — `VirtualizedProductGrid` powers Home, Search, Category, Deals, and `ProductCollection` (windowed rendering + scroll restoration + decode-gated commit).
- **Memoized cards** — `ProductCard` and its sub-parts (`ProductBadges`, `WishlistButton`, `QuickViewButton`, `BuyNowButton`) use `memo` with custom prop comparators.
- **Stable context values** — `cart`, `wishlist`, `region` use `useSyncExternalStore` split selectors (`useCartQty`/`useCartActions`, `useWishlistSaved`/`useWishlistActions`) and `useMemo`/`useCallback` for provider values.
- **Device-tier governor** — `runtime-capability.ts` measures live FPS + long tasks and flips `data-degrade-effects`, dropping blur/backdrop-filter/multi-layer shadows on struggling devices while preserving premium on capable ones. GPU compat gate (`gpu-compat`) handles weak Mali/PowerVR/Adreno.
- **Image pipeline** — responsive srcset, in-memory decode warming, adjacent-only prefetch gated by capability (Phase 4B).

So this phase is **targeted gap-closing**, not a rebuild. I will not duplicate the above.

## Remaining gaps to address

```text
1. Horizontal rails      ProductRail, RelatedProducts render items inline,
   not memoized           no item memoization → re-render on parent state
2. Idle deferral         No shared requestIdleCallback helper for non-critical
                          post-interaction work (telemetry, prefetch triggers)
3. INP on tap paths      Add-to-cart / qty / wishlist handlers should paint
                          the optimistic UI before running async/toast work
4. Layout-read batching   Any getBoundingClientRect/offset reads interleaved
                          with writes in scroll/resize paths
5. Low-end CSS trim      Confirm degrade-mode CSS covers rails + testimonials
                          (shadows/blur) not just grids
```

## Implementation

### 1. Memoize rail items
- Wrap `ProductRail` and `RelatedProducts` item mapping so each card is a stable memoized child; ensure any passed callbacks are `useCallback`-stable. Rails are short, so no virtualization — memoization is the right tool.

### 2. Shared idle helper
- Add `src/lib/idle.ts` exposing `runWhenIdle(fn)` (requestIdleCallback with setTimeout fallback) and use it to defer non-critical work already running eagerly after interactions (telemetry publish, non-visible prefetch). No behavior change, just scheduling.

### 3. Paint-first interaction handlers
- In cart/wishlist/qty handlers, commit the optimistic state update first, defer the `toast` and any analytics to a microtask/idle callback so the tap paints immediately. Keeps checkout/business logic identical.

### 4. Read-before-write in layout paths
- Audit `VirtualizedProductGrid` and any scroll/resize measurement for interleaved DOM read/write; batch reads via `requestAnimationFrame` where needed. Only if a real thrash is found.

### 5. Degrade-mode CSS coverage
- Ensure `[data-degrade-effects="true"]` rules in `src/styles.css` also trim heavy shadows/blur on rails, testimonials, and category cards — not just the product grid.

## Explicitly out of scope (unchanged)
Checkout, cart/order/invoice logic, variants, auth, SEO, DB schema, visual design, the image pipeline, and the cache layer. No new runtime experiments or placeholder code.

## Verification
- `tsgo` clean (zero TS errors).
- Playwright run on Home + Search + a Category route: capture console for long-task warnings, confirm no visual regression via screenshots, confirm grid scroll position preserved.
- Spot-check add-to-cart, qty change, wishlist toggle still work and toast still appears.
- Confirm CLS unchanged (aspect-ratio boxes untouched).
- Report: components optimized, re-renders eliminated, expected INP/FPS impact, memory/CPU notes, bundle delta (idle helper is ~1KB, no new deps).

## Report deliverable
A final summary with files modified, before/after render behavior per surface, and a compatibility note (2GB/4GB/6GB+ Android, iPhone, desktop) — mapped to the governor tiers already in place.
