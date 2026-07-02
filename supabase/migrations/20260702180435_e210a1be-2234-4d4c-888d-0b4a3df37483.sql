-- Privacy-safe public reviews: stop exposing reviewer UUIDs to anonymous visitors.
DROP VIEW IF EXISTS public.product_reviews_public;

CREATE VIEW public.product_reviews_public AS
  SELECT
    r.id,
    r.product_slug,
    p.full_name  AS author_name,
    p.avatar_url AS author_avatar_url,
    r.rating,
    r.title,
    r.body,
    r.media,
    r.status,
    r.pinned,
    r.featured,
    r.verified_purchase,
    r.helpful_count,
    r.not_helpful_count,
    r.admin_reply,
    r.admin_reply_at,
    r.created_at,
    r.updated_at
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.status = 'published' AND r.deleted_at IS NULL;

GRANT SELECT ON public.product_reviews_public TO anon, authenticated;

-- Allow signed-in customers to read their OWN review directly (needed for
-- edit/delete + "you already reviewed" state now that user_id is no longer
-- surfaced in the public view). Only their own rows — no cross-user exposure.
DROP POLICY IF EXISTS "own review select" ON public.product_reviews;
CREATE POLICY "own review select" ON public.product_reviews
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);