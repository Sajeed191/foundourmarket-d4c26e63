# Site Rules Controller — v1.0

Single source of truth for homepage merchandising rules. Persisted in the
`public.site_rules` table (realtime-enabled) and read by both customer-facing
rails and admin surfaces.

## Customer-facing settings

| Rule                     | Effect                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `limits.<collection>`    | Max products rendered in each homepage rail (Trending, Best Sellers…). |
| `limits.flash_deals`     | Max Flash Deal cards on the homepage strip.                            |
| `rotation.hours`         | How often the visible slice rotates (1 / 2 / 4 / 6 / 12 / 24 h, IST).  |
| `reshuffle.times[]`      | IST clock times when the daily deterministic order regenerates.        |
| `reshuffle.nonce`        | Bumped by "Reshuffle now" — instantly re-randomizes every rail.        |

## How rotation works

`fairPagedSlice()` in `src/lib/fair-rotation.ts` slices the eligible product
list into pages of size `limit`. The current IST rotation window picks
`windowIndex % pageCount`, so every eligible product appears before any
repeats. The queue is deterministically shuffled once per IST day (seed mixes
day + section key + reshuffle nonce), so SSR and every visitor see the same
order within a window.

## How badge assignment works

`assignBadge()` in `src/lib/use-product-badges.ts` enforces the **Single
Promotional Badge policy**: assigning any promo badge (`flash_deal`,
`hot_deal`, `trending`, `bestseller`, `new`) atomically deletes any other
promo badge on the same product. Utility badges (e.g. `ready_to_ship`) and
**`featured`** are unaffected.

## Featured Editorial Override

`featured` is deliberately **not** a promotional badge — it is an editorial
overlay that can coexist with exactly one promo badge. Site Rules exposes a
`featuredMode` toggle (`admin-site-rules.tsx` → "Featured behavior"):

| Mode | Behavior |
| ---- | -------- |
| `editorial_overlay` (default) | Featured products appear in Featured **and** their single resolved promo section. Non-Featured products never appear in more than one promo section. |
| `multi_section`               | Featured products bypass the resolver and appear in every promo section they are badged for. Non-Featured products still follow the single-promo rule. |

When a product carries multiple live promo badges (legacy data, imports,
manual overrides), `resolvePromoCollections()` collapses it to exactly one
using a load-balancing algorithm: pick the promo collection with the fewest
currently resolved products; break ties with the priority order
`flash_deals → trending → bestseller → new_arrivals`.

Every homepage rail reads eligibility through `productInHomepageCollection()`
so the resolver is the single source of truth.

## Admin pages that write to the same data

- `src/routes/admin-site-rules.tsx` — limits, rotation, reshuffle schedule,
  featured behavior, global "Reshuffle now" action.
- `src/routes/admin-product.$slug.merchandising.tsx` — per-product badge
  assignment (routes through `assignBadge`, so the single-badge policy holds).
- Any bulk merchandising tools must also call `assignBadge` — never write to
  `product_badges` directly.

## Deprecated (do not use in new code)

- `filterFlag` prop on `ProductCollection` — use `collectionKey` instead.
- `isFlashDealProduct()` in `src/lib/use-flash-deals.ts` — homepage Flash
  Deal membership is driven by live `product_badges` assignments.
- `hasAssignedCollectionBadge()` for homepage collection filtering — use
  `productInHomepageCollection()` so the Featured Editorial Override
  resolver is honored. `hasAssignedCollectionBadge` is still fine for
  per-product presentational checks (e.g. picking which flash icon to show).
