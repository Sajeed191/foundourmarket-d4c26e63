## Goal
Make the Badge Manager (`badge_types` table) the single source of truth for every badge shown in the marketplace. Delete the legacy hardcoded catalog and route every surface through one component.

## Current State
Two parallel badge systems exist:

1. **Legacy (to delete)** — `src/lib/badges.ts` defines a hardcoded catalog (`flash_deal, featured, staff_pick, editors_choice, gift_idea, bestseller, trending, fast_selling, premium, hot_deal, limited_stock, new`) with baked-in colors (`BADGE_STYLES`), priorities (`PRIORITY`), and computes badges from product flags via `computeBadges()`. `src/components/ui/ProductBadge.tsx` has its own hardcoded `BADGE_PALETTE`. Product cards, PDP, browse presentation, badge-visibility helper, and admin merchandising all reference these constants.

2. **Badge Manager (keep, becomes canonical)** — `badge_types` table + `product_badges` assignments, driven by `src/lib/use-product-badges.ts`. Admin UI at `admin-badges.tsx`, bulk at `admin-badges-bulk.tsx`, analytics at `admin-badges-analytics.tsx`. Already has: name, slug (`badge_key`), priority, colors, animation, schedule, live realtime sync.

## Plan

### 1. Canonical catalog (DB seed)
Migration to ensure `badge_types` contains exactly the 8 v4 badges with priorities and default colors:

```
flash_deal (95), hot_deal (90), bestseller (85), trending (80),
new (70), recommended (60), best_value (50), popular (40)
```

Delete/archive any row whose `badge_key` is not in this list (fast_selling, editors_choice, staff_pick, premium, featured, gift_idea, limited_stock, plus any custom rows the admin created). Cascade removes their `product_badges` assignments.

### 2. One shared component: `MarketplaceBadge`
Rewrite `src/components/ui/ProductBadge.tsx` → `MarketplaceBadge.tsx` (keep a shim export for now). Component takes a `BadgeType` row (or `slug`) and renders inline styles built ONLY from that row's `backgroundColor`/`textColor`/`borderColor`/`glowColor`/`radius`/`fontSize`/`fontWeight`/`animation`. No color maps, no palette constants, no per-slug switch. Delete `BADGE_PALETTE`, `badgeStyle()`, `BADGE_LABEL_SHORT` in that file.

### 3. Delete legacy code
- Delete `src/lib/badges.ts` entirely (`BADGE_STYLES`, `PRIORITY`, `computeBadges`, `singleBadge`, `BadgeKey`, `BadgeSettings`, `MAX_CARD_BADGES`).
- Delete `src/lib/use-badge-settings.ts` and `badge_settings` usage in code (leave DB table alone; unused).
- Delete `src/routes/admin-bulk-badges.tsx` (legacy; keep only `admin-badges-bulk.tsx`).
- Prune legacy computed-badge branches from `src/lib/badge-visibility.tsx`, `src/lib/browse/presentation-adapter.ts`, `src/lib/merchandising.ts`, `src/lib/inventory-marketing.ts`, `src/lib/product-marketing.ts`. Anything that assigned old keys (`fast_selling`, `staff_pick`, `premium`, etc.) either maps to the nearest v4 slug (`fast_selling`→`trending`, `hot_deal` stays, `limited_stock`→drop, `featured`/`staff_pick`/`editors_choice`/`gift_idea`/`premium`→drop) or is removed.

### 4. Rewrite the resolver
Replace `computeBadges` with a single `resolveProductBadge(productSlug, ctx?)` in `use-product-badges.ts` that:
- reads the live `badge_types` snapshot + `product_badges` assignments (already loaded and realtime-synced)
- optionally consumes auto-rules (`auto_rule` on the badge_type) against product metrics for slugs like `bestseller`, `trending`, `new` when there is no manual assignment
- returns the single highest-priority live badge (respecting `enabled`, `archived`, `startAt`/`endAt`)

Every surface calls this. There is no other badge selection.

### 5. Storefront surfaces
Refactor to consume the resolver + `MarketplaceBadge` only:
- `src/components/site/ProductCard.tsx` (removes inline `assignedFlashKey`, `isAssignedFlashBadge`, `ProductBadgesImpl` custom palette work)
- `src/components/site/BrowseCard.tsx` (`forceBadge` prop stays but is now a `badge_key` string, not a `BadgeKey` enum)
- `src/routes/products.$slug.tsx` (PDP hero badge)
- `src/routes/search.tsx` (`collectionBadge`, exclusive-collection filters — now match by `badge_key`)
- `src/components/site/RecommendationStrip.tsx`, `RecommendedForYou.tsx`, `RelatedProducts.tsx`, `WishlistCard.tsx`, `RecentlyViewed.tsx`, `PDPRecommendations.tsx`, `FlashDeals.tsx`, `FlashSaleStrip.tsx`, `SmartRecommendations.tsx`, `QuickViewDialog.tsx`, carousels
- `src/components/site/DiscountBadge.tsx` already returns null — leave.

### 6. Admin surfaces
- `admin-badges.tsx` — preview pill uses `MarketplaceBadge` (removes local `badgePreviewStyle`).
- `admin-badges-bulk.tsx` — verify bulk assign / remove / replace / schedule / activate / deactivate / priority all call `assignBadge`/`unassignBadge`/`updateBadgeTypeFull`; add any missing action. Confirm changes propagate (already realtime-subscribed).
- `admin-merchandising.tsx` and per-product merchandising editor — remove the toggles for deleted flags (`fast_selling`, `editors_choice`, `staff_pick`, `premium`, `featured`, `gift_idea`) from the UI. Keep DB columns; just stop displaying/writing them.

### 7. Live sync verification
Everything already flows: Badge Manager write → `badge_types`/`product_badges` → Supabase realtime → `useProductBadges` snapshot → `MarketplaceBadge`. No caches to bust.

### 8. Cleanup pass
Grep-remove references to: `computeBadges`, `singleBadge`, `BadgeKey`, `BADGE_STYLES`, `BADGE_PALETTE`, `BADGE_LABEL_SHORT`, `useBadgeSettings`, `MAX_CARD_BADGES`, `badgeStyle(`, `ProductBadge` (rename to `MarketplaceBadge`), `use-badge-settings`. Delete `admin-bulk-badges.tsx`. Typecheck must pass.

## Out of scope
- Backend column removal (keeping `products.featured`, `.staff_pick`, etc. for now — they'll just no longer feed badges).
- Recommendation scoring rules that internally use `featured`/`bestseller` numeric signals (untouched; presentation-only refactor).

## Risk & confirmation
This deletes ~5 badge types the admin may have real product assignments for. On migration, those `product_badges` rows are removed. Merchandising flags for deprecated badges disappear from the admin UI but remain in the DB. Confirm before I proceed — this is a large, cross-cutting change (~30+ files edited, 2 files deleted, 1 migration).
