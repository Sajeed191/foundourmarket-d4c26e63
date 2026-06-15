-- Phase 5: Email-to-Ticket channel support

-- 1. Channel + source + guest fields on tickets
ALTER TABLE public.support_tickets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_name text;

-- 2. Email metadata on messages (audit trail)
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS inbound_email_id text,
  ADD COLUMN IF NOT EXISTS thread_id text,
  ADD COLUMN IF NOT EXISTS reply_to_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS processing_status text;

-- 3. Inbound email audit / event log
CREATE TABLE IF NOT EXISTS public.support_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL DEFAULT 'inbound',
  provider_message_id text,
  thread_id text,
  reply_to_id text,
  from_email text,
  to_email text,
  subject text,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  rejection_reason text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_email_events TO authenticated;
GRANT ALL ON public.support_email_events TO service_role;

ALTER TABLE public.support_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view inbound email events"
ON public.support_email_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_support_email_events_ticket ON public.support_email_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_email_events_provider_msg ON public.support_email_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_support_email_events_status ON public.support_email_events(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_guest_email ON public.support_tickets(guest_email);