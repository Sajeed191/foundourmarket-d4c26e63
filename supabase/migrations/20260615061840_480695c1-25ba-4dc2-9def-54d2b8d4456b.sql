
-- =========================================================================
-- 1. EXTEND support_tickets
-- =========================================================================
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START 1000;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_number text,
  ADD COLUMN IF NOT EXISTS unread_customer_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_admin_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill ticket numbers for any existing rows.
UPDATE public.support_tickets
SET ticket_number = 'FOM-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0')
WHERE ticket_number IS NULL;

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_number_key
  ON public.support_tickets (ticket_number);

-- =========================================================================
-- 2. EXTEND support_messages (read/delivered receipts)
-- =========================================================================
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- =========================================================================
-- 3. support_notifications
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.support_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
  notification_type text NOT NULL DEFAULT 'new_message',
  title text,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notifications_user_unread_idx
  ON public.support_notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS support_notifications_ticket_idx
  ON public.support_notifications (ticket_id);

GRANT SELECT, UPDATE ON public.support_notifications TO authenticated;
GRANT ALL ON public.support_notifications TO service_role;

ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients view their support notifications"
  ON public.support_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "Recipients mark their support notifications read"
  ON public.support_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================================
-- 4. support_ticket_events (status/assignment/priority history + analytics)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON public.support_ticket_events (ticket_id, created_at DESC);

GRANT SELECT ON public.support_ticket_events TO authenticated;
GRANT ALL ON public.support_ticket_events TO service_role;

ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner and staff view ticket events"
  ON public.support_ticket_events FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_events.ticket_id AND t.user_id = auth.uid()
    )
  );

-- =========================================================================
-- 5. TRIGGER: assign ticket_number on insert
-- =========================================================================
CREATE OR REPLACE FUNCTION public.support_assign_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'FOM-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_assign_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_support_assign_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_assign_ticket_number();

-- =========================================================================
-- 6. TRIGGER: on new message -> counts, first_response, notifications
-- =========================================================================
CREATE OR REPLACE FUNCTION public.support_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.support_tickets%ROWTYPE;
  recipient uuid;
BEGIN
  -- Skip seeded/demo content entirely.
  IF NEW.is_seeded THEN
    RETURN NEW;
  END IF;

  SELECT * INTO t FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_role = 'customer' THEN
    -- Customer -> admin side.
    UPDATE public.support_tickets
      SET unread_admin_count = unread_admin_count + 1
      WHERE id = NEW.ticket_id;

    recipient := t.assigned_to;
    IF recipient IS NOT NULL THEN
      INSERT INTO public.support_notifications (user_id, ticket_id, message_id, notification_type, title, body)
      VALUES (recipient, NEW.ticket_id, NEW.id, 'new_message',
              'New customer message',
              'A customer replied to ticket ' || COALESCE(t.ticket_number, ''));
    END IF;
  ELSE
    -- Admin or system -> customer side.
    UPDATE public.support_tickets
      SET unread_customer_count = unread_customer_count + 1,
          first_response_at = CASE
            WHEN first_response_at IS NULL AND NEW.sender_role = 'staff' THEN now()
            ELSE first_response_at
          END
      WHERE id = NEW.ticket_id;

    IF t.user_id IS NOT NULL THEN
      INSERT INTO public.support_notifications (user_id, ticket_id, message_id, notification_type, title, body)
      VALUES (t.user_id, NEW.ticket_id, NEW.id, 'new_message',
              'New message from FoundOurMarket Support',
              'You received a reply regarding your support conversation.');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_on_new_message ON public.support_messages;
CREATE TRIGGER trg_support_on_new_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_on_new_message();

-- =========================================================================
-- 7. TRIGGER: opening a conversation resets unread counts
-- =========================================================================
CREATE OR REPLACE FUNCTION public.support_on_read_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = t.user_id THEN
    UPDATE public.support_tickets SET unread_customer_count = 0 WHERE id = NEW.ticket_id;
  ELSIF public.is_staff(NEW.user_id) THEN
    UPDATE public.support_tickets SET unread_admin_count = 0 WHERE id = NEW.ticket_id;
  END IF;

  -- Mark this user's inbound messages as read + clear their support notifications.
  UPDATE public.support_messages
    SET read_at = now()
    WHERE ticket_id = NEW.ticket_id
      AND read_at IS NULL
      AND sender_id <> NEW.user_id;

  UPDATE public.support_notifications
    SET read = true
    WHERE ticket_id = NEW.ticket_id AND user_id = NEW.user_id AND read = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_on_read_marker ON public.support_ticket_reads;
CREATE TRIGGER trg_support_on_read_marker
  AFTER INSERT OR UPDATE ON public.support_ticket_reads
  FOR EACH ROW EXECUTE FUNCTION public.support_on_read_marker();

-- =========================================================================
-- 8. TRIGGER: record status history + closed_at
-- =========================================================================
CREATE OR REPLACE FUNCTION public.support_on_ticket_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.support_ticket_events (ticket_id, actor_id, event_type, from_status, to_status)
    VALUES (NEW.id, auth.uid(), 'status_change', OLD.status, NEW.status);

    IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.status = 'resolved' AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.support_ticket_events (ticket_id, actor_id, event_type, meta)
    VALUES (NEW.id, auth.uid(), 'assignment',
            jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.support_ticket_events (ticket_id, actor_id, event_type, meta)
    VALUES (NEW.id, auth.uid(), 'priority_change',
            jsonb_build_object('from', OLD.priority, 'to', NEW.priority));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_on_ticket_change ON public.support_tickets;
CREATE TRIGGER trg_support_on_ticket_change
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_on_ticket_change();

-- =========================================================================
-- 9. REALTIME
-- =========================================================================
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_ticket_reads REPLICA IDENTITY FULL;
ALTER TABLE public.support_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_reads; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.support_notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
