
CREATE POLICY "staff insert newsletter audit"
  ON public.newsletter_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role,'editor'::app_role]));
