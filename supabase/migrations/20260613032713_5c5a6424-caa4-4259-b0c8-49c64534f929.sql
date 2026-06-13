DROP POLICY IF EXISTS "Badge settings readable by everyone" ON public.badge_settings;

CREATE POLICY "Staff can read badge settings"
  ON public.badge_settings FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));