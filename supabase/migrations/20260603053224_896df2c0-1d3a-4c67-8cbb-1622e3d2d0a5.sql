-- 1. CMS POSTS: hide draft_data / has_draft from public
DROP POLICY IF EXISTS "published posts public" ON public.cms_posts;

CREATE OR REPLACE VIEW public.cms_posts_public AS
  SELECT id, slug, title, excerpt, body, cover_image, author,
         meta_title, meta_description, published_at, created_at, updated_at
  FROM public.cms_posts
  WHERE published_at IS NOT NULL AND published_at <= now();

GRANT SELECT ON public.cms_posts_public TO anon, authenticated;

-- 2. PRODUCT REVIEWS: remove owner full-row read of moderation/fraud fields
DROP POLICY IF EXISTS "own reviews select" ON public.product_reviews;

-- 3. REALTIME (anon): remove payment-gateways-live from guest-subscribable topics
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
    OR realtime.topic() = 'rt-badge-settings'
  );