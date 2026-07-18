
-- 1. Grants: required for the Data API to reach the table
GRANT INSERT ON public.newsletter_subscribers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;

-- 2. Add subscribed_at column, backfill, keep in sync via trigger
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz;

UPDATE public.newsletter_subscribers
   SET subscribed_at = created_at
 WHERE subscribed_at IS NULL;

ALTER TABLE public.newsletter_subscribers
  ALTER COLUMN subscribed_at SET DEFAULT now();

-- Keep subscribed_at accurate when a row is (re)activated
CREATE OR REPLACE FUNCTION public.newsletter_track_subscribed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.subscribed_at IS NULL THEN
      NEW.subscribed_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'subscribed' AND (OLD.status IS DISTINCT FROM 'subscribed') THEN
      NEW.subscribed_at := now();
      NEW.unsubscribed_at := NULL;
    ELSIF NEW.status = 'unsubscribed' AND (OLD.status IS DISTINCT FROM 'unsubscribed') AND NEW.unsubscribed_at IS NULL THEN
      NEW.unsubscribed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_track_subscribed_at ON public.newsletter_subscribers;
CREATE TRIGGER newsletter_track_subscribed_at
  BEFORE INSERT OR UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_track_subscribed_at();

-- 3. Remove redundant per-authenticated-user INSERT policy
--    (the broader "public can subscribe" policy already permits authenticated users)
DROP POLICY IF EXISTS "authenticated subscribers use account email" ON public.newsletter_subscribers;
