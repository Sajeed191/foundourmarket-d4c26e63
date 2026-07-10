DROP POLICY IF EXISTS "product-images public read by name" ON storage.objects;

CREATE POLICY "product-images public read published only"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'product-images'
  AND name IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.product_images pi
      JOIN public.products p ON p.slug = pi.product_slug
      WHERE pi.url LIKE '%' || storage.objects.name
        AND p.deleted_at IS NULL
        AND p.status = 'published'
    )
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
  )
);