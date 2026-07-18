
-- Stage 1: Newsletter Security & Anti-Spam
-- Adds spam fingerprint columns, abuse status, rate-limit table, audit log.
-- Revokes direct anon INSERT; all public subscribes now go through the
-- server route which enforces honeypot / rate limit / disposable checks.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS ip_hash        text,
  ADD COLUMN IF NOT EXISTS ua_hash        text,
  ADD COLUMN IF NOT EXISTS browser        text,
  ADD COLUMN IF NOT EXISTS referrer       text,
  ADD COLUMN IF NOT EXISTS landing_page   text,
  ADD COLUMN IF NOT EXISTS abuse_status   text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS flag_reason    text;

ALTER TABLE public.newsletter_subscribers
  DROP CONSTRAINT IF EXISTS newsletter_abuse_status_chk;
ALTER TABLE public.newsletter_subscribers
  ADD CONSTRAINT newsletter_abuse_status_chk
  CHECK (abuse_status IN ('normal','flagged','blocked'));

CREATE INDEX IF NOT EXISTS newsletter_subscribers_abuse_status_idx
  ON public.newsletter_subscribers(abuse_status);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_source_idx
  ON public.newsletter_subscribers(source);

-- Public subscribes go through server route only.
DROP POLICY IF EXISTS "public can subscribe" ON public.newsletter_subscribers;
REVOKE INSERT ON public.newsletter_subscribers FROM anon;

-- ============================================================
-- Rate-limit attempts (ephemeral log; purged by a nightly job later)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.newsletter_submission_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      text NOT NULL,
  email_hash   text,
  outcome      text NOT NULL,                -- 'accepted' | 'duplicate' | 'rate_limited' | 'disposable' | 'honeypot' | 'invalid' | 'error'
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.newsletter_submission_attempts TO authenticated;
GRANT ALL    ON public.newsletter_submission_attempts TO service_role;

ALTER TABLE public.newsletter_submission_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view attempts"
  ON public.newsletter_submission_attempts FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role]));

CREATE INDEX IF NOT EXISTS nl_attempts_ip_time_idx
  ON public.newsletter_submission_attempts(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS nl_attempts_created_idx
  ON public.newsletter_submission_attempts(created_at DESC);

-- ============================================================
-- Audit log for newsletter admin + system actions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.newsletter_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       uuid,
  actor_email    text,
  action         text NOT NULL,
  target_email   text,
  target_id      uuid,
  reason         text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash        text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.newsletter_audit_log TO authenticated;
GRANT ALL    ON public.newsletter_audit_log TO service_role;

ALTER TABLE public.newsletter_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view newsletter audit"
  ON public.newsletter_audit_log FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role]));

CREATE INDEX IF NOT EXISTS nl_audit_created_idx
  ON public.newsletter_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS nl_audit_action_idx
  ON public.newsletter_audit_log(action, created_at DESC);
