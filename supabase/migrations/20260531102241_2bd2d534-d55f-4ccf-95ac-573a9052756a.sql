-- Courier automation: idempotency, source tracking, raw payloads, and real ETA fields.

-- shipment_events: support webhook-driven, deduplicated, auditable events
ALTER TABLE public.shipment_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS courier text,
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS raw jsonb;

-- Idempotency: a given courier event (by its external id) can only land once per shipment.
CREATE UNIQUE INDEX IF NOT EXISTS shipment_events_dedup_idx
  ON public.shipment_events (shipment_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- shipments: real courier ETA + sync metadata
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS actual_delivery timestamptz,
  ADD COLUMN IF NOT EXISTS eta_source text,
  ADD COLUMN IF NOT EXISTS last_courier_sync timestamptz;

-- Webhook delivery audit + replay protection store for courier webhooks.
CREATE TABLE IF NOT EXISTS public.courier_webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier text NOT NULL,
  external_event_id text,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received',
  tracking_number text,
  shipment_id uuid,
  payload jsonb,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Replay protection / idempotency at the webhook layer: same courier + event id only once.
CREATE UNIQUE INDEX IF NOT EXISTS courier_webhook_events_dedup_idx
  ON public.courier_webhook_events (courier, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS courier_webhook_events_courier_idx
  ON public.courier_webhook_events (courier, received_at DESC);

-- Service-role only: webhooks write via the admin client; no client access.
GRANT ALL ON public.courier_webhook_events TO service_role;
ALTER TABLE public.courier_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated => no client access. service_role bypasses RLS.