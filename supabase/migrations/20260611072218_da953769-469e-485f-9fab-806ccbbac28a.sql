DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='account_locks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.account_locks';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='fraud_alerts') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.fraud_alerts';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='newsletter_subscribers') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.newsletter_subscribers';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='saved_payment_methods') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.saved_payment_methods';
  END IF;
END $$;