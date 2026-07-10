-- Restrict public SELECT on product_images to published, non-deleted products.
DROP POLICY IF EXISTS "product images viewable by everyone" ON public.product_images;
CREATE POLICY "Public can view images of published products"
ON public.product_images
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.slug = product_images.product_slug
      AND p.deleted_at IS NULL
      AND p.status = 'published'
  )
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
);

-- Restrict public SELECT on product_badges to published, non-deleted products.
DROP POLICY IF EXISTS "Product badges readable by everyone" ON public.product_badges;
CREATE POLICY "Public can view badges of published products"
ON public.product_badges
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.slug = product_badges.product_slug
      AND p.deleted_at IS NULL
      AND p.status = 'published'
  )
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
);