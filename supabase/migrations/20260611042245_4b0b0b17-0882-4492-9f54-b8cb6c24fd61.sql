DROP POLICY IF EXISTS "variants viewable by everyone" ON public.product_variants;

CREATE POLICY "Published product variants are viewable"
  ON public.product_variants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.slug = product_variants.product_slug
        AND p.status = 'published'
    )
  );