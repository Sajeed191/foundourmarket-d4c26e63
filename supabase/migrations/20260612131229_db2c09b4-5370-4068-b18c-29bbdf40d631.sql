-- 1) Allow staff to read return photos for processing returns
CREATE POLICY "Staff can read return photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'return-photos'
  AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role])
);

-- 2) Restrict public exposure of product_variants (hide internal SKU; route public reads through a controlled view)
-- Public-facing view excludes the internal sku column
CREATE OR REPLACE VIEW public.product_variants_public AS
SELECT v.id, v.product_slug, v.name, v.price_override, v.stock_quantity, v.sort_order
FROM public.product_variants v
JOIN public.products p ON p.slug = v.product_slug AND p.status = 'published';

GRANT SELECT ON public.product_variants_public TO anon, authenticated;

-- Staff need to read all variants (incl. drafts + sku) for admin management
CREATE POLICY "staff read variants"
ON public.product_variants
FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));

-- Remove the broad public table policy that exposed sku + stock directly
DROP POLICY IF EXISTS "Published product variants are viewable" ON public.product_variants;