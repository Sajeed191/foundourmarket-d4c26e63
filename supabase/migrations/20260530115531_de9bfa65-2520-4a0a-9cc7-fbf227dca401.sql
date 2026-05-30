CREATE TABLE IF NOT EXISTS public.payment_gateways (
  provider TEXT NOT NULL PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'sandbox',
  publishable_key_present BOOLEAN NOT NULL DEFAULT false,
  secret_key_present BOOLEAN NOT NULL DEFAULT false,
  webhook_configured BOOLEAN NOT NULL DEFAULT false,
  supports_region TEXT NOT NULL DEFAULT 'international',
  last_checked_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateways_mode_chk CHECK (mode IN ('sandbox','production')),
  CONSTRAINT payment_gateways_region_chk CHECK (supports_region IN ('india','international','all'))
);

-- A gateway is considered fully configured (and able to unlock checkout) only
-- when it is enabled AND has both keys present.
ALTER TABLE public.payment_gateways
  ADD COLUMN IF NOT EXISTS configured BOOLEAN
  GENERATED ALWAYS AS (publishable_key_present AND secret_key_present) STORED;

GRANT SELECT ON public.payment_gateways TO anon, authenticated;
GRANT ALL ON public.payment_gateways TO service_role;

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment gateways public read" ON public.payment_gateways
  FOR SELECT USING (true);

CREATE POLICY "admins update payment gateways" ON public.payment_gateways
  FOR UPDATE USING (has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[]));

CREATE POLICY "admins insert payment gateways" ON public.payment_gateways
  FOR INSERT WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[]));

CREATE TRIGGER payment_gateways_set_updated_at
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payment_gateways (provider, display_name, supports_region)
VALUES
  ('stripe', 'Stripe', 'international'),
  ('paypal', 'PayPal', 'international')
ON CONFLICT (provider) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_gateways;