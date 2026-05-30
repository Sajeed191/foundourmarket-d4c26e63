DROP POLICY IF EXISTS "admins update any question" ON public.product_questions;
CREATE POLICY "staff update any question"
  ON public.product_questions FOR UPDATE
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));

DROP POLICY IF EXISTS "admins delete any question" ON public.product_questions;
CREATE POLICY "staff delete any question"
  ON public.product_questions FOR DELETE
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));