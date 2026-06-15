CREATE TABLE public.support_ticket_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  rated_at timestamptz NOT NULL DEFAULT now(),
  -- analytics snapshot (captured at rating time for future reporting)
  category text,
  priority text,
  assigned_agent uuid,
  resolution_time_ms bigint,
  -- negative feedback review workflow
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id)
);

CREATE INDEX idx_support_ticket_ratings_rating ON public.support_ticket_ratings (rating);
CREATE INDEX idx_support_ticket_ratings_customer ON public.support_ticket_ratings (customer_id);
CREATE INDEX idx_support_ticket_ratings_agent ON public.support_ticket_ratings (assigned_agent);
CREATE INDEX idx_support_ticket_ratings_rated_at ON public.support_ticket_ratings (rated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_ratings TO authenticated;
GRANT ALL ON public.support_ticket_ratings TO service_role;

ALTER TABLE public.support_ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers insert own ticket ratings"
ON public.support_ticket_ratings
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.user_id = auth.uid()
  )
);

CREATE POLICY "Customers and staff view ratings"
ON public.support_ticket_ratings
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role])
);

CREATE POLICY "Customers update own unreviewed ratings"
ON public.support_ticket_ratings
FOR UPDATE
TO authenticated
USING (customer_id = auth.uid() AND reviewed = false)
WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Staff update ratings review state"
ON public.support_ticket_ratings
FOR UPDATE
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));

CREATE TRIGGER update_support_ticket_ratings_updated_at
BEFORE UPDATE ON public.support_ticket_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_ratings;