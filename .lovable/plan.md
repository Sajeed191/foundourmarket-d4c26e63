## Product Card Badge System v2 — One Badge, AI-Driven

Collapse the current stacked badge system (Trending + Premium + Recommended + Ready to Ship, etc.) into a single AI-selected marketing badge per card, following strict priority + section rules. Operational info (Ready to Ship, Free Shipping, Stock) moves out of the image and under the price.

### Scope

**Frontend/presentation only.** No changes to Catalog Intelligence, Marketplace Intelligence, Recommendation Broker, or badge computation engines. AI already ranks — we just stop rendering multiple visible badges on top of it.

### The One-Badge Rule

Single priority ladder used everywhere a card renders:

```text
1. Flash Deal / Hot Deal
2. Best Seller
3. Trending
4. New Arrival
5. Recommended         (from browse presentation)
6. Best Value          (from browse presentation)
7. Popular Choice      (from browse presentation)
8. Ready to Ship       (from browse presentation) ← only if nothing above wins
9. (no badge)
```

Higher priority wins; lower badges never render on the image. `Premium`, `Featured`, `Editor's Choice`, `Staff Pick`, `Gift Idea`, `Fast Selling`, `Limited Stock` are removed from card display entirely (still computed, just not shown as marketing pills).

### Section-Aware Behavior

| Surface | Badge shown |
|---|---|
| Flash Deals section / `/deals` | Flash Deal or Hot Deal only |
| Best Sellers section / `/products/best-sellers` | Best Seller only |
| Trending section / `/products/trending` | Trending only |
| New Arrivals section / `/products/new-arrivals` | New Arrival only |
| Category, Search, Recently Viewed, Related, PDP rails, Home personalized | AI-selected single badge via priority ladder |

### Ready to Ship Relocation

`Ready to Ship` stops being an image badge. Show as an inline check row under price alongside existing shipping/stock lines. Discount `-60%` pill stays where it is (already handled separately, `DiscountBadge` is already a no-op).

### Visual Treatment

- Position: **top-left** of image (currently badges live bottom-inside via `BrowseCard`; this moves them).
- Style: single rounded capsule, dark translucent bg, subtle shadow, max ~30% image width, uppercase 10–11px tracked label with emoji.
- The "Why?" `ⓘ` button (progressive disclosure reason) stays — bottom-right corner of image, one-sentence copy, no AI wording, no scores. Already conforms.

### Technical Changes

Files touched (all presentation-layer):

1. **`src/lib/badge-visibility.tsx`** — Add a `pickPrimaryBadge(product, context, engine, browsePresentation?)` that returns a single `Badge | null` following the unified priority ladder. Fold browse presentation badges (`Recommended`, `Best Value`, `Popular Choice`, `Ready to Ship`) into the same ladder so the browse adapter contract remains untouched but only one wins visually. Keep `useVisibleBadges` for back-compat but have it return at most one badge; deprecate `MAX_VISIBLE_BADGES` usage in cards.

2. **`src/components/site/BrowseCard.tsx`** — Render exactly one top-left capsule from the unified picker. Drop the bottom-row multi-badge strip. Filter `Ready to Ship` out of the image overlay so it can render below price instead. `ⓘ` stays bottom-right.

3. **`src/components/site/ProductCard.tsx`** (need to read first) — Switch its badge slot to the new single-badge picker; add the "Ready to Ship" check row under price when the browse presentation includes it OR the product is in-stock with fast shipping metadata.

4. **`src/lib/browse/`** adapter — No contract change. `presentation.badges` stays an array (frozen contract, additive only), but consumer components pick the highest-priority one. Section surfaces (`surface: "deals"` etc.) already select the correct badge upstream.

5. **Section grids** using `forceBadge` (`products.trending.tsx`, `products.new-arrivals.tsx`, `products.best-sellers.tsx`, Flash Deals section) — no change needed; `forceBadge` already collapses to one.

6. **Remove from card display**: `premium`, `featured`, `staff_pick`, `editors_choice`, `gift_idea`, `fast_selling`, `limited_stock` from the priority ladder used by `pickPrimaryBadge`. These stay computable for admin/analytics but never render as the winning card badge.

### Non-Goals

- No changes to admin badge settings UI.
- No changes to `computeBadges` core logic or `BadgeSettings` schema.
- No changes to Recommendation Broker, Marketplace Readiness, or any intelligence module.
- No changes to `ProductCard`'s image, layout metrics, virtualization, or CLS.
- Discount `-%` pill stays a no-op (already removed sitewide).

### Verification

- Build passes.
- Visit `/`, `/deals`, `/products/trending`, `/products/best-sellers`, `/products/new-arrivals`, `/category/<slug>` — confirm exactly one badge per card, correct per-section badge, `Ready to Ship` never on image, `ⓘ` still works.
- Snapshot check on category grid: no card has >1 image badge.
