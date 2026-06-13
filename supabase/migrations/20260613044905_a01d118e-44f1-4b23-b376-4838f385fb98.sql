-- Fix 1: Restrict rt-cart-% Realtime channel subscriptions to the cart owner.
-- Previously any authenticated user could subscribe to any 'rt-cart-<uuid>' topic.
DROP POLICY IF EXISTS fom_realtime_select ON realtime.messages;

CREATE POLICY fom_realtime_select ON realtime.messages
FOR SELECT TO authenticated
USING (
  CASE
    WHEN (realtime.topic() ~~ 'notifications:%'::text) THEN (realtime.topic() = ('notifications:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'addresses:%'::text) THEN (realtime.topic() = ('addresses:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'account-orders:%'::text) THEN (realtime.topic() = ('account-orders:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'spm-%'::text) THEN (realtime.topic() = ('spm-'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'support-tickets:%'::text) THEN (realtime.topic() = ('support-tickets:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'wishlist-alerts-%'::text) THEN (realtime.topic() = ('wishlist-alerts-'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'chat-orders:%'::text) THEN (realtime.topic() = ('chat-orders:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'support-thread:%'::text) THEN can_access_support_thread(realtime.topic())
    -- Cart channels: only the owner of the cart may subscribe.
    WHEN (realtime.topic() ~~ 'rt-cart-%'::text) THEN EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.user_id = auth.uid()
        AND realtime.topic() = ('rt-cart-'::text || c.id::text)
    )
    WHEN ((realtime.topic() ~~ 'rt-products%'::text) OR (realtime.topic() ~~ 'rt-product%'::text) OR (realtime.topic() ~~ 'rt-banners-%'::text) OR (realtime.topic() ~~ 'rt-cms-%'::text) OR (realtime.topic() ~~ 'reviews:%'::text) OR (realtime.topic() = 'categories-live'::text) OR (realtime.topic() = 'rt-testimonials'::text) OR (realtime.topic() = 'rt-announcements'::text) OR (realtime.topic() = 'rt-homepage-sections'::text) OR (realtime.topic() = 'rt-storefront-blocks'::text) OR (realtime.topic() = 'rt-flash-deals'::text) OR (realtime.topic() = 'store-settings-live'::text)) THEN true
    WHEN ((realtime.topic() = 'rt-badge-settings'::text) OR (realtime.topic() = 'rt-campaign-events'::text) OR (realtime.topic() ~~ 'live-%'::text) OR (realtime.topic() = 'activity-feed'::text) OR (realtime.topic() ~~ 'fin-%'::text) OR (realtime.topic() ~~ 'financial-%'::text) OR (realtime.topic() ~~ 'exec-%'::text) OR (realtime.topic() ~~ 'cust-intel%'::text) OR (realtime.topic() ~~ 'customer-marketing%'::text) OR (realtime.topic() ~~ 'cust-mkt%'::text) OR (realtime.topic() = 'intel-rt'::text) OR (realtime.topic() ~~ 'fraud-%'::text) OR (realtime.topic() ~~ 'traffic-%'::text) OR (realtime.topic() ~~ 'mkt-%'::text) OR (realtime.topic() ~~ 'ai-ops-%'::text) OR (realtime.topic() ~~ 'ai-fb-%'::text) OR (realtime.topic() = 'analytics-live'::text) OR (realtime.topic() = 'storefront-dashboard'::text) OR (realtime.topic() = 'dash-draft-activity'::text) OR (realtime.topic() ~~ 'inventory-marketing%'::text) OR (realtime.topic() ~~ 'product-marketing%'::text) OR (realtime.topic() = 'bulk-visibility'::text) OR (realtime.topic() ~~ 'admin-%'::text) OR (realtime.topic() ~~ 'user-intel-%'::text) OR (realtime.topic() = 'category-cms'::text) OR (realtime.topic() ~~ 'marketplace%'::text) OR (realtime.topic() = 'orders-live'::text) OR (realtime.topic() = 'shipment-command-center'::text) OR (realtime.topic() ~~ 'order-drawer-%'::text) OR (realtime.topic() ~~ 'pay-drawer-%'::text) OR (realtime.topic() ~~ 'order-ops-%'::text) OR (realtime.topic() = 'support-settings-live'::text) OR (realtime.topic() = 'rt-growth-center'::text) OR (realtime.topic() = 'rt-cms-posts-list'::text) OR (realtime.topic() = 'payment-gateways-live'::text)) THEN has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role])
    ELSE false
  END
);

-- Fix 2: Re-affirm the products Realtime publication with an explicit safe
-- column allow-list, so sensitive cost/warehouse columns can never be
-- broadcast to subscribers even if the publication is later altered.
ALTER PUBLICATION supabase_realtime DROP TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products
  (id, slug, name, tagline, category, price, rating, reviews, image, description, in_stock, discount, sort_order, created_at, updated_at, featured, sku, stock_quantity, low_stock_threshold, views_count, price_inr, compare_price_inr, price_usd, compare_price_usd, india_visible, international_visible, warranty, status, shipping_fee_inr, shipping_fee_usd, razorpay_enabled, stripe_enabled, paypal_enabled, cod_enabled, return_eligible, replacement_eligible, return_window_days, pickup_supported, international_shipping, fragile, customs_info, restock_eta, preorder, scheduled_publish_at, scheduled_expiry_at, sold_count, wishlist_count, tags, features, meta_keywords, seo_title, seo_description, specifications, attributes, bestseller, trending, new_arrival, hot_deal, deleted_at, deleted_by, inventory_tracking, shipping_class, delivery_estimate, collection, homepage_section, brand, product_type, weight, length, width, height, video_url, demo_url, flash_deal, staff_pick, recommended, homepage_hero, gift_idea, is_category_banner, hide_from_search, hide_from_recommendations, homepage_position, category_position, featured_until, related_products, cross_sell_products, upsell_products, orders_count, premium, fast_selling, editors_choice, priority_score, collections, initial_rating, initial_review_count, rating_source);