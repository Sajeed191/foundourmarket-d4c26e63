CREATE POLICY "staff delete any review"
ON public.product_reviews
FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));