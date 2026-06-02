-- Categories: widen write policies to the standard staff editing tier
DROP POLICY IF EXISTS "admins insert categories" ON public.categories;
DROP POLICY IF EXISTS "admins update categories" ON public.categories;
DROP POLICY IF EXISTS "admins delete categories" ON public.categories;

CREATE POLICY "staff insert categories" ON public.categories
  FOR INSERT TO public
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "staff update categories" ON public.categories
  FOR UPDATE TO public
  USING (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "staff delete categories" ON public.categories
  FOR DELETE TO public
  USING (has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[]));

-- Product images: widen write policies to match products (admin + super_admin)
DROP POLICY IF EXISTS "admins insert product images" ON public.product_images;
DROP POLICY IF EXISTS "admins update product images" ON public.product_images;
DROP POLICY IF EXISTS "admins delete product images" ON public.product_images;

CREATE POLICY "staff insert product images" ON public.product_images
  FOR INSERT TO public
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "staff update product images" ON public.product_images
  FOR UPDATE TO public
  USING (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "staff delete product images" ON public.product_images
  FOR DELETE TO public
  USING (has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[]));