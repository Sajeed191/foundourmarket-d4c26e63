-- Ensure REPLICA IDENTITY DEFAULT (primary key) so column lists are allowed
ALTER TABLE public.orders REPLICA IDENTITY DEFAULT;
ALTER TABLE public.payments REPLICA IDENTITY DEFAULT;
ALTER TABLE public.products REPLICA IDENTITY DEFAULT;

-- Re-add to realtime publication with explicit column lists excluding sensitive fields
ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders
  (id, user_id, status, currency, subtotal, shipping, tax, total, created_at, updated_at, discount, promo_code, payment_method, payment_status, fulfillment_status, tracking_number, carrier, stock_state, expires_at, market_region, payment_provider, is_seeded, attribution_session_id, attribution_utm, paid_at, fulfilled_at, cancelled_at, cancel_window_expires_at);

ALTER PUBLICATION supabase_realtime DROP TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments
  (id, order_id, user_id, method, status, amount, currency, demo, created_at, is_seeded);

ALTER PUBLICATION supabase_realtime DROP TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products
  (id, slug, name, tagline, category, price, rating, reviews, image, description, in_stock, discount, sort_order, created_at, updated_at, featured, sku, stock_quantity, low_stock_threshold, reserved_quantity, views_count, price_inr, compare_price_inr, price_usd, compare_price_usd, india_visible, international_visible, warranty, status, shipping_fee_inr, shipping_fee_usd, razorpay_enabled, stripe_enabled, paypal_enabled, cod_enabled, return_eligible, replacement_eligible, return_window_days, pickup_supported, international_shipping, fragile, customs_info, barcode, preorder, scheduled_publish_at, scheduled_expiry_at, sold_count, wishlist_count, tags, features, meta_keywords, seo_title, seo_description, specifications, attributes, bestseller, trending, new_arrival, hot_deal, deleted_at, deleted_by, inventory_tracking, shipping_class, delivery_estimate, collection, homepage_section, brand, product_type, weight, length, width, height, video_url, demo_url, flash_deal, staff_pick, recommended, homepage_hero, gift_idea, is_category_banner, hide_from_search, hide_from_recommendations, homepage_position, category_position, featured_until, related_products, cross_sell_products, upsell_products, orders_count, premium, fast_selling, editors_choice, priority_score, collections, initial_rating, initial_review_count, rating_source);