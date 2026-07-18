
ALTER TABLE public.newsletter_security_settings
  ADD COLUMN IF NOT EXISTS double_opt_in_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_ttl_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_verification_token_key
  ON public.newsletter_subscribers (verification_token)
  WHERE verification_token IS NOT NULL;
