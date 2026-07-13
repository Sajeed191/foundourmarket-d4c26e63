## Enterprise Filter System — Phase 2

Builds on the existing client-side search pipeline (`search_products` RPC → full result set → client filter/sort/paginate). No DB schema, checkout, orders, inventory, SEO, auth, or product-URL changes.

### What already exists (keep)
- Full-set fetch + client filtering/sorting (`src/routes/search.tsx`).
- `src/lib/search-filters.ts` — `matchesFilters`, `applyFilters`, `brandFacets`, `countActive`, sort options.
- `src/components/site/MobileFilterDrawer.tsx` — accordion drawer, price slider, offers, rating, discount tiers.
- URL sync via TanStack search params.

### Key finding
A lightweight variant facet source already exists: the `product_variants_public` view (columns: `product_slug, color, color_hex, size, stock_quantity, price_override, price_adjustment, compare_price`). We query ONLY these columns for the current result set — never full variant objects. (Currently 0 published variants, so variant sections auto-hide until variants exist — validates the intelligent-facet design.)

### 1. Variant facet layer (new)
`src/lib/variant-facets.ts`:
- `fetchVariantFacets(slugs: string[])` → queries `product_variants_public` selecting only `product_slug,color,color_hex,size,stock_quantity,price_override,price_adjustment,compare_price` where `product_slug IN (...)` (chunked to stay small).
- Builds a `Map<slug, VariantSummary>`: available colours, sizes, min/max effective price, any-in-stock.
- Pure, memoizable; payload minimal.

`src/lib/search-facets.ts` (FacetEngine): given rows + variant map + current filters, compute dynamic facets with live counts for brand, colour, size, rating, discount, offers — each excluding its own dimension (same skip pattern as `brandFacets`). Hide zero-count values; hide whole sections with no values; auto-collapse single-value sections.

### 2. Variant-aware filtering
Extend `src/lib/search-filters.ts`:
- Add `color` and `size` to `Filters` (+ `validateSearch` in `search.tsx`, back-compat preserved).
- `matchesFilters` gains a variant map param. If a product has a variant summary: colour/size match against variant data, price band + stock use variant effective price/stock. If no variants: existing product-data path unchanged.

### 3. Live counts + product count
`ResultCounter` — always-visible "N Products", updates instantly. Drawer apply button already shows live draft count; extend counts to every facet chip via FacetEngine.

### 4. Premium price slider
Upgrade `PriceRangeSlider`: floating tooltip while dragging (already partial), animated handles, manual min/max numeric inputs with range validation + currency formatting, keyboard accessible (Radix already provides arrow-key support; add labels).

### 5. Sticky applied-filter bar (new)
`src/components/site/ActiveFilterBar.tsx` — sticky row of removable chips (category, brand, colour, size, price, rating, discount, offers) + "Clear All". Shown on both mobile results view and desktop. Each chip removes just its dimension via URL update.

### 6. Empty state
Replace current empty block with: message, Clear Filters / Back / Browse Categories buttons, and (when possible) a few recommended products from the unfiltered set.

### 7. State preservation
Filters/sort/search already in URL (restored on refresh, back, deep link). Add scroll-position + visibleCount restore on back-nav using `sessionStorage` keyed by search string, so returning from a product keeps scroll, pagination, and infinite-scroll window.

### 8. Modular structure (future-ready)
```text
src/lib/
  search-filters.ts   FilterState + predicates (extended)
  search-facets.ts    FacetEngine (dynamic facets + counts)
  variant-facets.ts   VariantFacetProvider (lightweight query)
src/components/site/
  MobileFilterDrawer.tsx   FilterDrawer (extended: colour/size sections)
  ActiveFilterBar.tsx      sticky chips (new)
  ResultCounter.tsx        product count (new)
```
Adding a new facet = add a field to `Filters`, a predicate branch, and a facet descriptor — no refactor.

### 9. Performance & a11y
Memoize facet/variant computations; virtualize long brand/colour lists inside the drawer; chunked variant query; ARIA labels, focus management, large touch targets, high-contrast tokens throughout.

### Verification
Build passes; run through the checklist (category/sub/brand/colour/size/price/variant price/variant stock/rating/availability/discount/offers/search/sort/pagination/infinite scroll/URL/back/refresh/chips/clear/live counts/empty/guest+logged-in/no duplicates). Confirm variant sections hide gracefully with 0 variants and appear once variants exist.

### Technical notes
- Variant query uses `product_variants_public` (RLS-safe, published+active only) — no service role, no schema change.
- All new params optional with `fallback`-style defaults; legacy `disc=1` deep links still map to `sale`.
