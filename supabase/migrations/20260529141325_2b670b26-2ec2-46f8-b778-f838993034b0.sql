CREATE TABLE public.inbox_placement_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID,
  token TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  gmail_address TEXT,
  outlook_address TEXT,
  gmail_placement TEXT,
  outlook_placement TEXT,
  gmail_message_id TEXT,
  outlook_message_id TEXT,
  gmail_checked_at TIMESTAMP WITH TIME ZONE,
  outlook_checked_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_placement_tests TO authenticated;
GRANT ALL ON public.inbox_placement_tests TO service_role;

ALTER TABLE public.inbox_placement_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Email staff can view placement tests"
ON public.inbox_placement_tests
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

CREATE POLICY "Email staff can create placement tests"
ON public.inbox_placement_tests
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

CREATE POLICY "Email staff can update placement tests"
ON public.inbox_placement_tests
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

CREATE TRIGGER set_inbox_placement_tests_updated_at
BEFORE UPDATE ON public.inbox_placement_tests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_inbox_placement_tests_created_at ON public.inbox_placement_tests (created_at DESC);