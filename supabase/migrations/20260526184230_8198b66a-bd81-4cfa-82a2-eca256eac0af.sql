DROP POLICY IF EXISTS "admins read activity logs" ON public.admin_activity_logs;
CREATE POLICY "staff read activity logs"
ON public.admin_activity_logs
FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role, 'support'::app_role]));