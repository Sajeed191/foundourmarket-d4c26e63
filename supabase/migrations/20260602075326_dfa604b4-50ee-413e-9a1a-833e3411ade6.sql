
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS flash_deal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_pick boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_hero boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_idea boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_category_banner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_from_search boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_from_recommendations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_position integer,
  ADD COLUMN IF NOT EXISTS category_position integer,
  ADD COLUMN IF NOT EXISTS featured_until timestamptz,
  ADD COLUMN IF NOT EXISTS related_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cross_sell_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS upsell_products text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS orders_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW public.products_public AS
 SELECT id, slug, name, tagline, category, price, rating, reviews, image,
    description, in_stock, discount, sort_order, created_at, updated_at,
    featured, sku, stock_quantity, low_stock_threshold, reserved_quantity,
    views_count, price_inr, compare_price_inr, price_usd, compare_price_usd,
    india_visible, international_visible, warranty, status, shipping_fee_inr,
    shipping_fee_usd, razorpay_enabled, stripe_enabled, paypal_enabled,
    cod_enabled, return_eligible, replacement_eligible, return_window_days,
    pickup_supported, international_shipping, fragile, customs_info, restock_eta,
    preorder, scheduled_publish_at, scheduled_expiry_at, sold_count,
    wishlist_count, tags, features, meta_keywords, seo_title, seo_description,
    specifications, attributes, bestseller, trending, new_arrival, hot_deal,
    inventory_tracking, shipping_class, delivery_estimate, collection,
    homepage_section,
    flash_deal, staff_pick, recommended, homepage_hero, gift_idea,
    is_category_banner, hide_from_search, hide_from_recommendations,
    homepage_position, category_position, featured_until,
    related_products, cross_sell_products, upsell_products, orders_count
   FROM products
  WHERE deleted_at IS NULL;
