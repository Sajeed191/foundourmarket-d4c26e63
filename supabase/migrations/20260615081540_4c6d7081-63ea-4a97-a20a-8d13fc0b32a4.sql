CREATE TABLE public.support_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_attachments TO authenticated;
GRANT ALL ON public.support_attachments TO service_role;

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_support_attachments_ticket ON public.support_attachments(ticket_id, created_at);

-- View: ticket owner or support staff
CREATE POLICY "View support attachments"
ON public.support_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);

-- Insert: uploader is self AND (ticket owner OR staff)
CREATE POLICY "Add support attachments"
ON public.support_attachments FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
  )
);

-- Delete: uploader or staff
CREATE POLICY "Remove support attachments"
ON public.support_attachments FOR DELETE
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);