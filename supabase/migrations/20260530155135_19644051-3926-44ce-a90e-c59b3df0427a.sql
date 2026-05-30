-- ============================================================
-- P0-2: PRODUCT DATA EXPOSURE LOCKDOWN
-- ============================================================

-- Safe, public-facing catalog view. Excludes sensitive internal columns:
-- cost, cost_price_inr, cost_price_usd, admin_notes, warehouse_location, barcode.
-- Runs with definer privileges (default) so the public catalog is readable
-- while the base table stays locked to staff. Only non-deleted rows exposed.
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public AS
SELECT
  id, slug, name, tagline, category, price, rating, reviews, image, description,
  in_stock, discount, sort_order, created_at, updated_at, featured, sku,
  stock_quantity, low_stock_threshold, reserved_quantity, views_count,
  price_inr, compare_price_inr, price_usd, compare_price_usd,
  india_visible, international_visible, warranty, status,
  shipping_fee_inr, shipping_fee_usd,
  razorpay_enabled, stripe_enabled, paypal_enabled, cod_enabled,
  return_eligible, replacement_eligible, return_window_days, pickup_supported,
  international_shipping, fragile, customs_info, restock_eta, preorder,
  scheduled_publish_at, scheduled_expiry_at, sold_count, wishlist_count,
  tags, features, meta_keywords, seo_title, seo_description,
  specifications, attributes, bestseller, trending, new_arrival, hot_deal,
  inventory_tracking, shipping_class, delivery_estimate, collection, homepage_section
FROM public.products
WHERE deleted_at IS NULL;

GRANT SELECT ON public.products_public TO anon, authenticated;

-- Lock the base table: only staff may read full product rows directly.
DROP POLICY IF EXISTS "products are viewable by everyone" ON public.products;

CREATE POLICY "staff can view all products"
ON public.products
FOR SELECT
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

-- Guests must never touch the base table; they use products_public.
REVOKE SELECT ON public.products FROM anon;

-- ============================================================
-- P0-3: REALTIME CHANNEL SECURITY
-- ============================================================

-- Staff-only operational / intelligence / financial / marketing / admin channels
-- require a staff role. Customer channels stay private to their owner.
-- Default for authenticated users is allow (customer/public channels), but every
-- known sensitive topic pattern is gated behind a staff-role check.
DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;
CREATE POLICY "fom_realtime_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      -- User-scoped private channels: only the owner
      WHEN realtime.topic() LIKE 'notifications:%'
        THEN realtime.topic() = 'notifications:' || auth.uid()::text
      WHEN realtime.topic() LIKE 'addresses:%'
        THEN realtime.topic() = 'addresses:' || auth.uid()::text
      WHEN realtime.topic() LIKE 'account-orders:%'
        THEN realtime.topic() = 'account-orders:' || auth.uid()::text
      WHEN realtime.topic() LIKE 'spm-%'
        THEN realtime.topic() = 'spm-' || auth.uid()::text
      WHEN realtime.topic() LIKE 'support-tickets:%'
        THEN realtime.topic() = 'support-tickets:' || auth.uid()::text
      -- Staff-only operational/intelligence/financial/marketing/admin channels
      WHEN realtime.topic() LIKE 'live-%'
        OR realtime.topic() = 'activity-feed'
        OR realtime.topic() LIKE 'fin-%'
        OR realtime.topic() LIKE 'financial-%'
        OR realtime.topic() LIKE 'exec-%'
        OR realtime.topic() LIKE 'cust-intel%'
        OR realtime.topic() LIKE 'customer-marketing%'
        OR realtime.topic() LIKE 'cust-mkt%'
        OR realtime.topic() = 'intel-rt'
        OR realtime.topic() LIKE 'fraud-%'
        OR realtime.topic() LIKE 'traffic-%'
        OR realtime.topic() LIKE 'mkt-%'
        OR realtime.topic() LIKE 'ai-ops-%'
        OR realtime.topic() LIKE 'ai-fb-%'
        OR realtime.topic() = 'analytics-live'
        OR realtime.topic() = 'storefront-dashboard'
        OR realtime.topic() = 'dash-draft-activity'
        OR realtime.topic() LIKE 'inventory-marketing%'
        OR realtime.topic() LIKE 'product-marketing%'
        OR realtime.topic() = 'bulk-visibility'
        OR realtime.topic() LIKE 'admin-%'
        OR realtime.topic() LIKE 'user-intel-%'
        OR realtime.topic() = 'category-cms'
        OR realtime.topic() LIKE 'marketplace%'
        THEN public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role])
      -- Everything else (public storefront + customer channels) for authenticated
      ELSE true
    END
  );

-- Allow guests to subscribe ONLY to public storefront channels.
DROP POLICY IF EXISTS "fom_realtime_select_anon" ON realtime.messages;
CREATE POLICY "fom_realtime_select_anon" ON realtime.messages
  FOR SELECT TO anon
  USING (
    realtime.topic() LIKE 'rt-products%'
    OR realtime.topic() = 'categories-live'
    OR realtime.topic() LIKE 'rt-banners-%'
    OR realtime.topic() = 'rt-testimonials'
    OR realtime.topic() LIKE 'reviews:%'
    OR realtime.topic() = 'rt-announcements'
    OR realtime.topic() LIKE 'rt-cms-%'
    OR realtime.topic() = 'rt-homepage-sections'
    OR realtime.topic() = 'rt-storefront-blocks'
    OR realtime.topic() = 'store-settings-live'
    OR realtime.topic() = 'payment-gateways-live'
    OR realtime.topic() = 'rt-badge-settings'
  );