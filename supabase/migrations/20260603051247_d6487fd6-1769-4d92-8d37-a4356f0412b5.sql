
-- ============================================================
-- 1. PRODUCT REVIEWS: hide internal moderation fields from public
-- ============================================================
DROP POLICY IF EXISTS "reviews viewable by everyone" ON public.product_reviews;

CREATE POLICY "own reviews select"
ON public.product_reviews
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "staff select reviews"
ON public.product_reviews
FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role]));

CREATE OR REPLACE VIEW public.product_reviews_public AS
  SELECT id, product_slug, user_id, rating, title, body, media, status,
         pinned, featured, verified_purchase, helpful_count, not_helpful_count,
         admin_reply, admin_reply_at, created_at, updated_at
  FROM public.product_reviews
  WHERE status = 'published';

GRANT SELECT ON public.product_reviews_public TO anon, authenticated;

-- ============================================================
-- 2. CMS PAGES: hide draft_data / has_draft from public
-- ============================================================
DROP POLICY IF EXISTS "published pages public" ON public.cms_pages;

CREATE OR REPLACE VIEW public.cms_pages_public AS
  SELECT id, slug, title, body, meta_title, meta_description,
         sort_order, last_published_at, created_at, updated_at
  FROM public.cms_pages
  WHERE published = true;

GRANT SELECT ON public.cms_pages_public TO anon, authenticated;

-- ============================================================
-- 3. BANNERS: hide draft_data / has_draft from public
-- ============================================================
DROP POLICY IF EXISTS "active banners public" ON public.banners;

CREATE OR REPLACE VIEW public.banners_public AS
  SELECT id, type, title, subtitle, image, mobile_image, link, cta_text,
         active, starts_at, ends_at, sort_order, width_px, height_px,
         region, pages, overlay_opacity, text_align, countdown_to,
         video_url, created_at, updated_at
  FROM public.banners
  WHERE active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now());

GRANT SELECT ON public.banners_public TO anon, authenticated;

-- ============================================================
-- 4. REALTIME: deny unrecognised topics by default (no ELSE true)
-- ============================================================
DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;

CREATE POLICY "fom_realtime_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    -- Personal, user-scoped topics
    WHEN realtime.topic() ~~ 'notifications:%'    THEN realtime.topic() = ('notifications:'    || auth.uid()::text)
    WHEN realtime.topic() ~~ 'addresses:%'        THEN realtime.topic() = ('addresses:'        || auth.uid()::text)
    WHEN realtime.topic() ~~ 'account-orders:%'   THEN realtime.topic() = ('account-orders:'   || auth.uid()::text)
    WHEN realtime.topic() ~~ 'spm-%'              THEN realtime.topic() = ('spm-'              || auth.uid()::text)
    WHEN realtime.topic() ~~ 'support-tickets:%'  THEN realtime.topic() = ('support-tickets:'  || auth.uid()::text)
    WHEN realtime.topic() ~~ 'wishlist-alerts-%'  THEN realtime.topic() = ('wishlist-alerts-'  || auth.uid()::text)
    WHEN realtime.topic() ~~ 'chat-orders:%'      THEN realtime.topic() = ('chat-orders:'      || auth.uid()::text)

    -- Public storefront topics (any signed-in user may subscribe)
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
      OR realtime.topic() = 'payment-gateways-live'
      OR realtime.topic() ~~ 'support-thread:%'
    ) THEN true

    -- Staff / admin-only topics
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
    ) THEN has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role])

    ELSE false
  END
);
