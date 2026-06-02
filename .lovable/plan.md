# Product Catalog Management Upgrade

Turn the Product Edit Manager into a full catalog system: visibility flags, placement positions, publishing controls, SEO, analytics, related products, and automatic storefront labels — all filterable, searchable, sortable, and bulk-editable in the admin product manager.

## 1. Database (migration)

The `products` table already has: `featured`, `trending`, `bestseller`, `new_arrival`, `hot_deal`, `status`, `scheduled_publish_at`, `scheduled_expiry_at`, `low_stock_threshold`, `seo_title`, `seo_description`, `meta_keywords`, `slug`, `views_count`, `wishlist_count`, `sold_count`, `sort_order`.

Add the missing columns:

- Visibility: `flash_deal`, `staff_pick`, `recommended`, `homepage_hero` (boolean, default false)
- Placement: `homepage_position`, `category_position`, `trending_position` (integer, nullable)
- Labels: `premium`, `fast_selling`, `gift_idea` (boolean, default false)
- Related: `related_products`, `cross_sell_products`, `upsell_products` (text[], default `{}`)
- Analytics: `orders_count` (integer, default 0), `revenue` (numeric, default 0)

`products_public` view will be updated to expose the new public-facing fields (flags, positions, labels, related arrays) — not cost/revenue internals.

## 2. Data layer (`src/lib/products.ts`)

Extend the `Product` type, `Row` type, `rowToProduct`, and `SELECT_COLS` with the new fields so both storefront and admin read them.

## 3. Server function (`src/lib/admin-products.functions.ts`)

Extend the Zod `updateSchema` + column map in `adminUpdateProduct` to accept all new fields, so inline edit, quick edit, and bulk edit can persist them. A bulk variant already flows through this fn.

## 4. Admin editor (`ProductEditorModal.tsx`)

Add new collapsible sections:

- **Product Visibility & Placement** — 8 toggles (Featured, Trending, New Arrival, Best Seller, Flash Deal, Staff Pick, Recommended, Homepage Hero) + 3 position number inputs (Homepage, Category, Trending).
- **Publishing** — status selector (Draft / Active / Scheduled / Out of Stock / Archived) + Publish Date + Expiry Date pickers.
- **Inventory** — Stock Alert Level (maps to `low_stock_threshold`).
- **SEO** — SEO Title, SEO Description, SEO Keywords, URL Slug.
- **Product Labels** — 7 toggles (Trending, New, Featured, Premium, Fast Selling, Hot Deal, Gift Idea).
- **Related Product Management** — multi-select pickers for Related / Cross Sell / Upsell products.
- **Product Analytics** (read-only card) — Total Views, Wishlist Count, Orders Count, Revenue, Conversion Rate (orders / views).

## 5. Bulk + filters (`admin-products.tsx`, `BulkVisibilityPanel.tsx`)

- Add column filters / search facets for status and the new flags (Featured, Flash Deal, Staff Pick, etc.).
- Add sortable columns for the position fields and analytics counts.
- Extend the bulk-edit panel to toggle the new visibility/label flags and set status across selected products.

## 6. Storefront labels (`src/lib/badges.ts` + `ProductCard.tsx`)

Add an admin-flag-driven label layer: when a product has `premium`, `gift_idea`, `staff_pick`, `flash_deal`, etc. set, render the corresponding pill on the product card automatically (capped, priority-ordered, alongside the existing computed discount/new badges).

## Technical notes

- Labels overlap with the existing computed badge system; flag-based labels take priority and are merged with the existing `computeBadges` output (deduped, capped at maxBadges).
- Conversion Rate is derived (`orders_count / views_count`), not stored.
- Publish/Expiry reuse existing `scheduled_publish_at` / `scheduled_expiry_at`; status "Active" maps to existing `published`.
- No new libraries; reuse existing toggles, CollapsibleModule, and Calendar/date inputs.

After approval I'll start with the migration, then wire the data layer, server fn, editor, bulk tools, and storefront labels.

&nbsp;

&nbsp;

Upgrade the Product Catalog Management system into a true marketplace catalog control center.

Before implementing, make the following architectural improvements:

1. Keep:

- Featured
- Trending
- Best Seller
- New Arrival
- Flash Deal
- Staff Pick
- Recommended
- Homepage Hero
- Homepage Position
- Category Position
- Related Products
- Cross Sell Products
- Upsell Products
- SEO controls
- Analytics controls
- Bulk editing tools

2. Remove:

- trending_position
- fast_selling toggle
- premium toggle

Reason: Fast Selling and Premium should be calculated automatically from analytics and product data instead of being manually controlled.

3. Add new fields:

Store Placement:

- homepage_section (Featured, Trending, Best Seller, New Arrival, Flash Deal, Recommended, None)
- is_category_banner boolean
- hide_from_search boolean
- hide_from_recommendations boolean
- featured_until timestamptz

4. Product Editor

Add a dedicated "Store Placement" module containing:

- Homepage Hero
- Homepage Featured
- Homepage Section
- Category Banner
- Homepage Position
- Category Position
- Hide From Search
- Hide From Recommendations
- Featured Until

5. Analytics

Show read-only metrics:

- Views
- Wishlist Count
- Orders Count
- Revenue
- Conversion Rate

Conversion Rate must be calculated dynamically:

orders_count / views_count

6. Automatic Labels

Do not manually control:

- Premium
- Fast Selling

Generate automatically using product analytics and pricing.

Keep manual labels:

- Staff Pick
- Flash Deal
- Gift Idea

7. Bulk Manager

Allow bulk updates for:

- Status
- Featured
- Trending
- Best Seller
- New Arrival
- Flash Deal
- Staff Pick
- Recommended
- Homepage Section
- Category Banner
- Hide From Search

8. Storefront

Merge admin-driven badges with existing badge logic.

Priority:

Flash Deal Staff Pick Gift Idea Trending Best Seller New Arrival

Maximum visible badges per product card: 3.

Goal: Transform the product manager into a professional marketplace merchandising system capable of controlling homepage placement, category placement, promotions, discovery, visibility, and product performance from one dashboard.