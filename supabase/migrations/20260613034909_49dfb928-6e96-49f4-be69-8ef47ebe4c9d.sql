-- 1. CMS PAGES: remove broad public SELECT that exposed draft_data. Storefront uses cms_pages_public view.
DROP POLICY IF EXISTS "public read published pages" ON public.cms_pages;

-- 2. REALTIME: remove rt-badge-settings from anon allow-list; restrict to staff on authenticated policy.
DROP POLICY IF EXISTS "fom_realtime_select_anon" ON realtime.messages;
CREATE POLICY "fom_realtime_select_anon" ON realtime.messages
  FOR SELECT TO anon
  USING (
    (realtime.topic() ~~ 'rt-products%'::text)
    OR (realtime.topic() = 'categories-live'::text)
    OR (realtime.topic() ~~ 'rt-banners-%'::text)
    OR (realtime.topic() = 'rt-testimonials'::text)
    OR (realtime.topic() ~~ 'reviews:%'::text)
    OR (realtime.topic() = 'rt-announcements'::text)
    OR (realtime.topic() ~~ 'rt-cms-%'::text)
    OR (realtime.topic() = 'rt-homepage-sections'::text)
    OR (realtime.topic() = 'rt-storefront-blocks'::text)
  );

DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;
CREATE POLICY "fom_realtime_select" ON realtime.messages
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
      WHEN ((realtime.topic() ~~ 'rt-products%'::text) OR (realtime.topic() ~~ 'rt-product%'::text) OR (realtime.topic() ~~ 'rt-banners-%'::text) OR (realtime.topic() ~~ 'rt-cms-%'::text) OR (realtime.topic() ~~ 'rt-cart-%'::text) OR (realtime.topic() ~~ 'reviews:%'::text) OR (realtime.topic() = 'categories-live'::text) OR (realtime.topic() = 'rt-testimonials'::text) OR (realtime.topic() = 'rt-announcements'::text) OR (realtime.topic() = 'rt-homepage-sections'::text) OR (realtime.topic() = 'rt-storefront-blocks'::text) OR (realtime.topic() = 'rt-flash-deals'::text) OR (realtime.topic() = 'store-settings-live'::text)) THEN true
      WHEN ((realtime.topic() = 'rt-badge-settings'::text) OR (realtime.topic() = 'rt-campaign-events'::text) OR (realtime.topic() ~~ 'live-%'::text) OR (realtime.topic() = 'activity-feed'::text) OR (realtime.topic() ~~ 'fin-%'::text) OR (realtime.topic() ~~ 'financial-%'::text) OR (realtime.topic() ~~ 'exec-%'::text) OR (realtime.topic() ~~ 'cust-intel%'::text) OR (realtime.topic() ~~ 'customer-marketing%'::text) OR (realtime.topic() ~~ 'cust-mkt%'::text) OR (realtime.topic() = 'intel-rt'::text) OR (realtime.topic() ~~ 'fraud-%'::text) OR (realtime.topic() ~~ 'traffic-%'::text) OR (realtime.topic() ~~ 'mkt-%'::text) OR (realtime.topic() ~~ 'ai-ops-%'::text) OR (realtime.topic() ~~ 'ai-fb-%'::text) OR (realtime.topic() = 'analytics-live'::text) OR (realtime.topic() = 'storefront-dashboard'::text) OR (realtime.topic() = 'dash-draft-activity'::text) OR (realtime.topic() ~~ 'inventory-marketing%'::text) OR (realtime.topic() ~~ 'product-marketing%'::text) OR (realtime.topic() = 'bulk-visibility'::text) OR (realtime.topic() ~~ 'admin-%'::text) OR (realtime.topic() ~~ 'user-intel-%'::text) OR (realtime.topic() = 'category-cms'::text) OR (realtime.topic() ~~ 'marketplace%'::text) OR (realtime.topic() = 'orders-live'::text) OR (realtime.topic() = 'shipment-command-center'::text) OR (realtime.topic() ~~ 'order-drawer-%'::text) OR (realtime.topic() ~~ 'pay-drawer-%'::text) OR (realtime.topic() ~~ 'order-ops-%'::text) OR (realtime.topic() = 'support-settings-live'::text) OR (realtime.topic() = 'rt-growth-center'::text) OR (realtime.topic() = 'rt-cms-posts-list'::text) OR (realtime.topic() = 'payment-gateways-live'::text)) THEN has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role])
      ELSE false
    END
  );