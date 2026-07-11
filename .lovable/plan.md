# Phase 3 — Variants Across Cart → Checkout → Orders → Invoice → Inventory

Goal: make the dynamic variant system flow end-to-end without changing behavior for the ~158 existing products (none of which use variants today). Every change is additive and gated on a variant actually being selected, so non-variant products follow the exact current code path.

## Guiding principle
The cart's identity changes from `slug` to a composite `slug + variantId`. When `variantId` is `null` (every product today), all logic reduces to the current behavior. This keeps existing carts, orders, and checkout byte-for-byte compatible.

## 1. Database (one migration)
- `order_items`: add `variant_id uuid`, `variant_name text`, `variant_size text`, `variant_color text`, `variant_sku text`, `variant_image text`. All nullable — historical rows and non-variant orders stay valid. Snapshotted at purchase so later admin edits never mutate history.
- `product_variants`: add `reserved_quantity int not null default 0` for per-variant reservations.
- Reservation RPCs: extend `reserve_order_stock`, the commit, and the release functions so that when an `order_items` row has a `variant_id`, availability and reservation apply to that `product_variants` row; when `variant_id` is null, behavior is unchanged (product-level). Product-level `reserved_quantity` continues to gate non-variant lines.
- Keeps existing GRANTs/RLS; no policy loosening.

## 2. Cart model (`src/lib/cart.tsx`)
- `CartItem` gains optional `variantId` + a snapshot (`variantName`, `size`, `color`, `sku`, `image`, `unitPriceUSD`). Line identity = `slug|variantId`.
- `add/remove/setQty/saveForLater/moveToCart/moveToWishlist` take an optional variant; DB rows read/write `variant_id` (column already exists). LS format extended (old entries parse fine — missing variant = null).
- Snapshot the selected variant on add so the cart keeps the user's choice even if the admin edits the product later (revalidated at checkout, not silently overwritten).
- Subtotal/count use the variant's price when present.

## 3. Product page (`src/routes/products.$slug.tsx`)
- When `has_variants` and no variant selected, Add to Cart / Buy Now are blocked with a "Select options" prompt.
- Add/Buy pass the selected variant + snapshot into cart/buy-now.

## 4. Cart UI (`src/routes/cart.tsx`)
- Per line: variant image, Size/Color/custom options, optional SKU, qty, unit price, stock status.
- If a line's variant became inactive/out of stock (revalidated on cart load), show a clear notice, block its checkout, and offer an inline switch to another available variant of the same product without removing it.

## 5. Checkout (`src/routes/checkout.tsx` + `src/lib/razorpay.functions.ts` + `global-beta.functions.ts`)
- Order item payload carries `variantId`.
- `repriceFromDb` reprices variant lines from `product_variants` (price_override / price_adjustment) via trusted server read; non-variant lines unchanged.
- Re-validate variant active + stock before payment; never allow an inactive/OOS variant through.
- Order-summary UI shows selected options + variant image + SKU.

## 6. Orders / Invoice / Admin
- `order_items` insert writes the variant snapshot columns.
- Customer order view (`orders.$id.tsx`, `account_.orders.tsx`), invoice (`invoice.ts` / `order-invoice.ts`), and admin orders (`admin-orders.tsx`) render options + SKU beneath the product name. Historical orders with no variant render exactly as today.

## 7. Inventory
- Admin variant builder already stores per-variant stock; reservation/commit now decrement the correct `product_variants` row. A product stays available while any variant has stock; only the depleted variant disables.

## 8. Performance
- No new queries on browse/scroll. Variant data loads only on the product page (already) and once at cart/checkout revalidation. Cart snapshots avoid per-render variant fetches.

## 9. Validation before finishing
- Typecheck clean (`tsgo`).
- Manual trace: a non-variant product still adds/checks out/creates order/invoice identically.
- A variant product requires selection, preserves the choice in cart, reprices correctly, reserves the right variant stock, and shows options in order + invoice + admin.

## Sequencing / risk
DB migration first (approved separately), then cart model, then product page, then cart UI, then checkout/server repricing, then order/invoice/admin display. Checkout server changes are the highest-risk step and are done last, after the read paths are verified. Because `variantId` is null for all current data, each step is a no-op for existing products until a variant is actually chosen.
