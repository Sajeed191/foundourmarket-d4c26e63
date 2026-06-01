-- Add explicit admin-only policies to courier_webhook_events.
-- The table is written exclusively by the service role (webhook handler),
-- which bypasses RLS. Adding explicit policies clears the "RLS enabled, no
-- policy" finding while keeping the table inaccessible to regular users.

CREATE POLICY "Admins can view courier webhook events"
ON public.courier_webhook_events
FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]));
