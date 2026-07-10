-- 1) Newsletter: make own-record read case-insensitive to match INSERT policy
DROP POLICY IF EXISTS "subscribers view own record" ON public.newsletter_subscribers;
CREATE POLICY "subscribers view own record"
ON public.newsletter_subscribers
FOR SELECT
USING (auth.uid() IS NOT NULL AND lower(email) = lower(auth.email()));

-- 2) Product images: replace fragile suffix LIKE with a bucket-anchored path match
DROP POLICY IF EXISTS "product-images public read published only" ON storage.objects;
CREATE POLICY "product-images public read published only"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'product-images'
  AND name IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM product_images pi
      JOIN products p ON p.slug = pi.product_slug
      WHERE pi.url LIKE ('%/product-images/' || objects.name)
        AND p.deleted_at IS NULL
        AND p.status = 'published'
    )
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
  )
);