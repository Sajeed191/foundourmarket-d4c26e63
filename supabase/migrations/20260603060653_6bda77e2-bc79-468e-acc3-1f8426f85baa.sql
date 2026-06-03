-- ============================================================
-- 1. REALTIME: move 'payment-gateways-live' to staff-only branch
-- ============================================================
DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;

CREATE POLICY "fom_realtime_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() ~~ 'notifications:%'    THEN realtime.topic() = ('notifications:'    || auth.uid()::text)
    WHEN realtime.topic() ~~ 'addresses:%'        THEN realtime.topic() = ('addresses:'        || auth.uid()::text)
    WHEN realtime.topic() ~~ 'account-orders:%'   THEN realtime.topic() = ('account-orders:'   || auth.uid()::text)
    WHEN realtime.topic() ~~ 'spm-%'              THEN realtime.topic() = ('spm-'              || auth.uid()::text)
    WHEN realtime.topic() ~~ 'support-tickets:%'  THEN realtime.topic() = ('support-tickets:'  || auth.uid()::text)
    WHEN realtime.topic() ~~ 'wishlist-alerts-%'  THEN realtime.topic() = ('wishlist-alerts-'  || auth.uid()::text)
    WHEN realtime.topic() ~~ 'chat-orders:%'      THEN realtime.topic() = ('chat-orders:'      || auth.uid()::text)

    WHEN (
         realtime.topic() ~~ 'rt-products%'
      OR realtime.topic() ~~ 'rt-product%'
      OR realtime.topic() ~~ 'rt-banners-%'
      OR realtime.topic() ~~ 'rt-cms-%'
      OR realtime.topic() ~~ 'rt-cart-%'
      OR realtime.topic() ~~ 'reviews:%'
      OR realtime.topic() = 'categories-live'
      OR realtime.topic() = 'rt-testimonials'
      OR realtime.topic() = 'rt-announcements'
      OR realtime.topic() = 'rt-homepage-sections'
      OR realtime.topic() = 'rt-storefront-blocks'
      OR realtime.topic() = 'rt-badge-settings'
      OR realtime.topic() = 'rt-flash-deals'
      OR realtime.topic() = 'rt-campaign-events'
      OR realtime.topic() = 'store-settings-live'
      OR realtime.topic() ~~ 'support-thread:%'
    ) THEN true

    WHEN (
         realtime.topic() ~~ 'live-%'
      OR realtime.topic() = 'activity-feed'
      OR realtime.topic() ~~ 'fin-%'
      OR realtime.topic() ~~ 'financial-%'
      OR realtime.topic() ~~ 'exec-%'
      OR realtime.topic() ~~ 'cust-intel%'
      OR realtime.topic() ~~ 'customer-marketing%'
      OR realtime.topic() ~~ 'cust-mkt%'
      OR realtime.topic() = 'intel-rt'
      OR realtime.topic() ~~ 'fraud-%'
      OR realtime.topic() ~~ 'traffic-%'
      OR realtime.topic() ~~ 'mkt-%'
      OR realtime.topic() ~~ 'ai-ops-%'
      OR realtime.topic() ~~ 'ai-fb-%'
      OR realtime.topic() = 'analytics-live'
      OR realtime.topic() = 'storefront-dashboard'
      OR realtime.topic() = 'dash-draft-activity'
      OR realtime.topic() ~~ 'inventory-marketing%'
      OR realtime.topic() ~~ 'product-marketing%'
      OR realtime.topic() = 'bulk-visibility'
      OR realtime.topic() ~~ 'admin-%'
      OR realtime.topic() ~~ 'user-intel-%'
      OR realtime.topic() = 'category-cms'
      OR realtime.topic() ~~ 'marketplace%'
      OR realtime.topic() = 'orders-live'
      OR realtime.topic() = 'shipment-command-center'
      OR realtime.topic() ~~ 'order-drawer-%'
      OR realtime.topic() ~~ 'pay-drawer-%'
      OR realtime.topic() ~~ 'order-ops-%'
      OR realtime.topic() = 'support-settings-live'
      OR realtime.topic() = 'rt-growth-center'
      OR realtime.topic() = 'rt-cms-posts-list'
      OR realtime.topic() = 'payment-gateways-live'
    ) THEN has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role])

    ELSE false
  END
);

-- ============================================================
-- 2. STORE SETTINGS: restrict base table to staff only
-- ============================================================
DROP POLICY IF EXISTS "authenticated read store settings" ON public.store_settings;

CREATE POLICY "staff read store settings"
ON public.store_settings
FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role]));

-- Recreate the public view to include customer-facing support WhatsApp numbers.
DROP VIEW IF EXISTS public.store_settings_public;
CREATE VIEW public.store_settings_public AS
  SELECT id, cod_enabled, prepaid_discount_percent, include_seed_in_analytics,
         shipping_mode, free_shipping_enabled, flat_shipping_inr, flat_shipping_usd,
         free_shipping_threshold_inr, free_shipping_threshold_usd,
         support_status, support_response_minutes, support_whatsapp_numbers, updated_at
  FROM public.store_settings;

GRANT SELECT ON public.store_settings_public TO anon, authenticated;