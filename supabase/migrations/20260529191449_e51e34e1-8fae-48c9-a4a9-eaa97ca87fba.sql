-- Banner CMS: grant Data API access + add advanced columns + analytics table

-- 1. CRITICAL FIX: grant Data API access (was missing -> all reads/inserts denied)
GRANT SELECT ON public.banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT ALL ON public.banners TO service_role;

-- 2. Advanced banner fields (idempotent)
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS overlay_opacity numeric NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS text_align text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS countdown_to timestamptz,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS impressions bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks bigint NOT NULL DEFAULT 0;

-- keep status / active in sync for legacy callers
UPDATE public.banners SET status = CASE WHEN active THEN 'published' ELSE 'draft' END;

-- 3. Atomic impression / click counters (callable by anyone, write-only increment)
CREATE OR REPLACE FUNCTION public.track_banner_event(_banner_id uuid, _event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event = 'impression' THEN
    UPDATE public.banners SET impressions = impressions + 1 WHERE id = _banner_id;
  ELSIF _event = 'click' THEN
    UPDATE public.banners SET clicks = clicks + 1 WHERE id = _banner_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.track_banner_event(uuid, text) TO anon, authenticated;

-- 4. Atomic reorder helper (swap sort_order between two banners) - editor+ only via RLS on banners
CREATE OR REPLACE FUNCTION public.reorder_banner(_id uuid, _direction text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_order int;
  cur_id uuid;
  swap_id uuid;
  swap_order int;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT sort_order, id INTO cur_order, cur_id FROM public.banners WHERE id = _id;
  IF cur_id IS NULL THEN RETURN; END IF;

  IF _direction = 'up' THEN
    SELECT id, sort_order INTO swap_id, swap_order FROM public.banners
      WHERE sort_order < cur_order ORDER BY sort_order DESC LIMIT 1;
  ELSE
    SELECT id, sort_order INTO swap_id, swap_order FROM public.banners
      WHERE sort_order > cur_order ORDER BY sort_order ASC LIMIT 1;
  END IF;

  IF swap_id IS NULL THEN RETURN; END IF;

  UPDATE public.banners SET sort_order = swap_order WHERE id = cur_id;
  UPDATE public.banners SET sort_order = cur_order WHERE id = swap_id;
END $$;

GRANT EXECUTE ON FUNCTION public.reorder_banner(uuid, text) TO authenticated;

-- 5. set bucket limits for banners (10MB, images + video)
UPDATE storage.buckets
  SET file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm']
  WHERE id = 'banners';