ALTER TABLE public.product_variant_images
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS poster_url text;

DROP VIEW IF EXISTS public.product_variant_images_public;

CREATE VIEW public.product_variant_images_public AS
  SELECT vi.id,
         vi.product_slug,
         vi.color,
         vi.image_url,
         vi.thumb_url,
         vi.medium_url,
         vi.media_type,
         vi.poster_url,
         vi.sort_order
  FROM public.product_variant_images vi
  JOIN public.products p
    ON p.slug = vi.product_slug AND p.status = 'published';

ALTER VIEW public.product_variant_images_public SET (security_invoker = off);

GRANT SELECT ON public.product_variant_images_public TO anon, authenticated;