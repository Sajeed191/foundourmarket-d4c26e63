CREATE OR REPLACE VIEW public.products_public AS
SELECT id, slug, name, tagline, category, price, rating, reviews, image, description,
  in_stock, discount, sort_order, created_at, updated_at, featured, sku, stock_quantity,
  low_stock_threshold, reserved_quantity, views_count, price_inr, compare_price_inr,
  price_usd, compare_price_usd, india_visible, international_visible, warranty, status,
  shipping_fee_inr, shipping_fee_usd, razorpay_enabled, stripe_enabled, paypal_enabled,
  cod_enabled, return_eligible, replacement_eligible, return_window_days, pickup_supported,
  international_shipping, fragile, customs_info, restock_eta, preorder, scheduled_publish_at,
  scheduled_expiry_at, sold_count, wishlist_count, tags, features, meta_keywords, seo_title,
  seo_description, specifications, attributes, bestseller, trending, new_arrival, hot_deal,
  inventory_tracking, shipping_class, delivery_estimate, collection, homepage_section,
  flash_deal, staff_pick, recommended, homepage_hero, gift_idea, is_category_banner,
  hide_from_search, hide_from_recommendations, homepage_position, category_position,
  featured_until, related_products, cross_sell_products, upsell_products, orders_count,
  premium, fast_selling, editors_choice, priority_score, collections,
  rating_source
FROM products
WHERE deleted_at IS NULL;