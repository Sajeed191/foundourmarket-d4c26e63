ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS price_adjustment numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compare_price numeric,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DROP VIEW IF EXISTS public.product_variants_public;

CREATE VIEW public.product_variants_public
WITH (security_invoker = on) AS
  SELECT v.id, v.product_slug, v.name, v.sku,
         v.size, v.color, v.color_hex, v.image_url,
         v.price_override, v.price_adjustment, v.compare_price,
         v.barcode, v.weight,
         v.stock_quantity, v.low_stock_threshold, v.sort_order
  FROM public.product_variants v
  JOIN public.products p ON p.slug = v.product_slug AND p.status = 'published'
  WHERE v.active = true;

GRANT SELECT ON public.product_variants_public TO anon, authenticated;