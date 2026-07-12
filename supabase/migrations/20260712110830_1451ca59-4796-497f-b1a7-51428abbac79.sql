CREATE TABLE IF NOT EXISTS public.product_variant_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL REFERENCES public.products(slug) ON DELETE CASCADE,
  color text NOT NULL,
  image_url text NOT NULL,
  thumb_url text,
  medium_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variant_images_slug_color_idx
  ON public.product_variant_images (product_slug, color, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variant_images TO authenticated;
GRANT ALL ON public.product_variant_images TO service_role;

ALTER TABLE public.product_variant_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read variant images"
  ON public.product_variant_images FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));

CREATE POLICY "admins insert variant images"
  ON public.product_variant_images FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update variant images"
  ON public.product_variant_images FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete variant images"
  ON public.product_variant_images FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.product_variant_images_public AS
  SELECT vi.id,
         vi.product_slug,
         vi.color,
         vi.image_url,
         vi.thumb_url,
         vi.medium_url,
         vi.sort_order
  FROM public.product_variant_images vi
  JOIN public.products p
    ON p.slug = vi.product_slug AND p.status = 'published';

ALTER VIEW public.product_variant_images_public SET (security_invoker = off);

GRANT SELECT ON public.product_variant_images_public TO anon, authenticated;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_image_max integer;