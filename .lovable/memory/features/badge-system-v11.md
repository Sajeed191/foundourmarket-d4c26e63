---
name: Badge System v1.1 — Consistency & Collection Fix (FROZEN)
description: Homepage vs View-All limit split, forced badges on collection pages, unified ProductBadge in Admin, dev verification logs, /deals sticky sort bar
---

# Badge System v1.1 — FROZEN

Ships on top of Badge System v3 (single-badge card rule) and Smart Homepage Collections v1.0.

## Rules

1. **Collection limits**
   - Homepage rails: `HOMEPAGE_PREVIEW` slice (8 items for standard rails, 4 for Flash Deals) — never uses Site Rules limit directly for display count.
   - View-All / collection pages (`/products/trending`, `/products/best-sellers`, `/products/new-arrivals`, `/deals`): display up to `rules.limits[key]` from Site Rules.
   - If eligible ≤ limit, show ALL eligible products (fair-rotation short-circuits via `n <= cap`).

2. **Forced badges on collection pages**
   - `/products/best-sellers` → `forceBadge="bestseller"`
   - `/products/trending` → `forceBadge="trending"`
   - `/products/new-arrivals` → `forceBadge="new"`
   - `/deals` → `forceBadge={p.flashDeal ? "flash_deal" : "hot_deal"}` per card.
   - The resolver must never hide a page's own promotional badge.

3. **Single badge component**
   - `<ProductBadge>` is the ONE badge component used sitewide, including the Admin Badge Manager (`ProductBadgeManager`).
   - Admin `BadgeChip` wraps `<ProductBadge>` — no duplicate CSS / colors / animation.

4. **Dev verification**
   - `ProductCollection` logs `eligible | visible | hiddenByRotation | hiddenByLimit | limit` per collection.
   - `useFlashDeals` logs eligible/visible/excluded per window.
   - `/deals` logs `visible | cap | category` and warns when visible exceeds cap.

5. **/deals redesign**
   - Sticky sort bar with `Biggest savings / Ending soon / Newest / Best rating`.
   - Existing hero + countdown + category chips preserved.
   - Cards force HOT DEAL / FLASH DEAL badge via `forceBadge`.
