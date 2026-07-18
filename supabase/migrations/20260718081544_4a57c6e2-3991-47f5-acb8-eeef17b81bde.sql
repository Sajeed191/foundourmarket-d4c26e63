
-- 1) Settings singleton
CREATE TABLE IF NOT EXISTS public.newsletter_security_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  honeypot_enabled boolean NOT NULL DEFAULT true,
  disposable_check_enabled boolean NOT NULL DEFAULT true,
  rate_limit_enabled boolean NOT NULL DEFAULT true,
  auto_block_enabled boolean NOT NULL DEFAULT true,
  timing_floor_enabled boolean NOT NULL DEFAULT true,
  fingerprint_enabled boolean NOT NULL DEFAULT true,
  burst_seconds int NOT NULL DEFAULT 10 CHECK (burst_seconds > 0),
  burst_limit int NOT NULL DEFAULT 1 CHECK (burst_limit > 0),
  hour_limit int NOT NULL DEFAULT 3 CHECK (hour_limit > 0),
  day_limit int NOT NULL DEFAULT 10 CHECK (day_limit > 0),
  min_submit_ms int NOT NULL DEFAULT 750 CHECK (min_submit_ms >= 0),
  abuse_threshold int NOT NULL DEFAULT 50 CHECK (abuse_threshold > 0),
  block_minutes int NOT NULL DEFAULT 60 CHECK (block_minutes > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.newsletter_security_settings TO authenticated;
GRANT ALL ON public.newsletter_security_settings TO service_role;

ALTER TABLE public.newsletter_security_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read security settings"
  ON public.newsletter_security_settings FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role,'editor'::app_role]));

CREATE POLICY "admin update security settings"
  ON public.newsletter_security_settings FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]));

INSERT INTO public.newsletter_security_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- 2) Temporary IP block list
CREATE TABLE IF NOT EXISTS public.newsletter_ip_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  reason text NOT NULL,
  score int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  cleared_at timestamptz
);

CREATE INDEX IF NOT EXISTS nl_ip_blocks_ip_active_idx
  ON public.newsletter_ip_blocks (ip_hash, expires_at DESC)
  WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS nl_ip_blocks_expires_idx
  ON public.newsletter_ip_blocks (expires_at DESC);

GRANT SELECT ON public.newsletter_ip_blocks TO authenticated;
GRANT ALL ON public.newsletter_ip_blocks TO service_role;

ALTER TABLE public.newsletter_ip_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view ip blocks"
  ON public.newsletter_ip_blocks FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role]));

CREATE POLICY "admin clear ip blocks"
  ON public.newsletter_ip_blocks FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]));

-- 3) Extend subscribers + attempts with richer fingerprint fields
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS abuse_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accept_language text,
  ADD COLUMN IF NOT EXISTS timezone text;

ALTER TABLE public.newsletter_submission_attempts
  ADD COLUMN IF NOT EXISTS abuse_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accept_language text,
  ADD COLUMN IF NOT EXISTS timezone text;

CREATE INDEX IF NOT EXISTS nl_attempts_outcome_created_idx
  ON public.newsletter_submission_attempts (outcome, created_at DESC);
