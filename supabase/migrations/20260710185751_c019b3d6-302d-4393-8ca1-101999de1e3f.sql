CREATE OR REPLACE FUNCTION public.is_product_published(_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.slug = _slug
      AND p.deleted_at IS NULL
      AND p.status = 'published'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_product_published(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view images of published products" ON public.product_images;
CREATE POLICY "Public can view images of published products"
ON public.product_images
FOR SELECT
USING (
  public.is_product_published(product_slug)
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
);

DROP POLICY IF EXISTS "Public can view badges of published products" ON public.product_badges;
CREATE POLICY "Public can view badges of published products"
ON public.product_badges
FOR SELECT
USING (
  public.is_product_published(product_slug)
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
);

CREATE OR REPLACE FUNCTION public.storage_object_is_published_product_image(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.product_images pi
    JOIN public.products p ON p.slug = pi.product_slug
    WHERE pi.url LIKE ('%/product-images/' || _object_name)
      AND p.deleted_at IS NULL
      AND p.status = 'published'
  )
$$;

GRANT EXECUTE ON FUNCTION public.storage_object_is_published_product_image(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "product-images public read published only" ON storage.objects;
CREATE POLICY "product-images public read published only"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'product-images'
  AND name IS NOT NULL
  AND (
    public.storage_object_is_published_product_image(name)
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role])
  )
);