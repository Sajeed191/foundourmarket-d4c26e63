-- ============ Read tracking ============
CREATE TABLE public.support_ticket_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_reads TO authenticated;
GRANT ALL ON public.support_ticket_reads TO service_role;

ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own read markers (select)"
ON public.support_ticket_reads FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users manage their own read markers (insert)"
ON public.support_ticket_reads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own read markers (update)"
ON public.support_ticket_reads FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own read markers (delete)"
ON public.support_ticket_reads FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============ Canned replies (staff) ============
CREATE TABLE public.support_canned_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_canned_replies TO authenticated;
GRANT ALL ON public.support_canned_replies TO service_role;

ALTER TABLE public.support_canned_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read canned replies"
ON public.support_canned_replies FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "Staff create canned replies"
ON public.support_canned_replies FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "Staff update canned replies"
ON public.support_canned_replies FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "Staff delete canned replies"
ON public.support_canned_replies FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE TRIGGER support_canned_replies_updated_at
BEFORE UPDATE ON public.support_canned_replies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Internal notes (staff only) ============
CREATE TABLE public.support_internal_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_internal_notes TO authenticated;
GRANT ALL ON public.support_internal_notes TO service_role;

ALTER TABLE public.support_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read internal notes"
ON public.support_internal_notes FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "Staff create internal notes"
ON public.support_internal_notes FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);

CREATE POLICY "Staff delete own internal notes"
ON public.support_internal_notes FOR DELETE TO authenticated
USING (
  author_id = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);

-- ============ Assignment + tags ============
ALTER TABLE public.support_tickets
  ADD COLUMN assigned_to UUID,
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}'::text[];

-- ============ Unread count helpers ============
CREATE OR REPLACE FUNCTION public.support_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.support_messages m
  JOIN public.support_tickets t ON t.id = m.ticket_id
  LEFT JOIN public.support_ticket_reads r
    ON r.ticket_id = m.ticket_id AND r.user_id = auth.uid()
  WHERE t.user_id = auth.uid()
    AND m.sender_role = 'staff'
    AND m.created_at > COALESCE(r.last_read_at, '1970-01-01'::timestamptz);
$$;

CREATE OR REPLACE FUNCTION public.support_admin_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]) THEN (
      SELECT count(*)::int
      FROM public.support_messages m
      LEFT JOIN public.support_ticket_reads r
        ON r.ticket_id = m.ticket_id AND r.user_id = auth.uid()
      WHERE m.sender_role = 'customer'
        AND m.created_at > COALESCE(r.last_read_at, '1970-01-01'::timestamptz)
    )
    ELSE 0
  END;
$$;

GRANT EXECUTE ON FUNCTION public.support_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_admin_unread_count() TO authenticated;

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_internal_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_canned_replies;