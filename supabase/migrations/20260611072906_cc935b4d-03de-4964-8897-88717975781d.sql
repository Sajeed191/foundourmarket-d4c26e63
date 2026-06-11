DROP POLICY IF EXISTS "Admins can update rotation state" ON public.rotation_state;

CREATE POLICY "Admins can update rotation state"
  ON public.rotation_state FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));