-- Extend newsletter_subscribers with signup context and enable public opt-in.
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS source_page text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

-- Backfill source_page from legacy source column for continuity.
UPDATE public.newsletter_subscribers
  SET source_page = source
  WHERE source_page IS NULL AND source IS NOT NULL;

-- Enforce plausible email shape at the DB layer.
ALTER TABLE public.newsletter_subscribers
  DROP CONSTRAINT IF EXISTS newsletter_email_format_chk;
ALTER TABLE public.newsletter_subscribers
  ADD CONSTRAINT newsletter_email_format_chk
  CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 255);

-- Allow anonymous public signups (status must start as 'subscribed').
DROP POLICY IF EXISTS "public can subscribe" ON public.newsletter_subscribers;
CREATE POLICY "public can subscribe"
  ON public.newsletter_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'subscribed');

-- Broaden staff read/manage access beyond just admin.
DROP POLICY IF EXISTS "admins view subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "admins update subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "admins delete subscribers" ON public.newsletter_subscribers;

CREATE POLICY "staff view subscribers"
  ON public.newsletter_subscribers
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','editor']::app_role[]));

CREATE POLICY "staff update subscribers"
  ON public.newsletter_subscribers
  FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

CREATE POLICY "staff delete subscribers"
  ON public.newsletter_subscribers
  FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[]));

GRANT INSERT ON public.newsletter_subscribers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;

CREATE INDEX IF NOT EXISTS newsletter_subscribers_created_at_idx
  ON public.newsletter_subscribers (created_at DESC);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx
  ON public.newsletter_subscribers (status);