DROP POLICY IF EXISTS "admins insert products" ON public.products;
DROP POLICY IF EXISTS "admins update products" ON public.products;
DROP POLICY IF EXISTS "admins delete products" ON public.products;

CREATE POLICY "admins insert products"
ON public.products FOR INSERT
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]));

CREATE POLICY "admins update products"
ON public.products FOR UPDATE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]));

CREATE POLICY "admins delete products"
ON public.products FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]));