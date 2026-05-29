-- Read-only reporting of pgmq email queue depths for the admin dashboard.
-- SECURITY DEFINER so it can read the protected pgmq schema; returns only counts.
CREATE OR REPLACE FUNCTION public.email_queue_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pgmq, public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  q record;
  base_name text;
  queued bigint;
  in_flight bigint;
  dlq_count bigint;
  archived bigint;
BEGIN
  FOR q IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pgmq'
      AND c.relkind = 'r'
      AND c.relname LIKE 'q\_%'
      AND c.relname NOT LIKE '%\_dlq'
    ORDER BY c.relname
  LOOP
    base_name := substring(q.relname from 3); -- strip leading 'q_'

    EXECUTE format('SELECT count(*) FROM pgmq.%I WHERE vt <= now()', q.relname) INTO queued;
    EXECUTE format('SELECT count(*) FROM pgmq.%I WHERE vt > now()', q.relname) INTO in_flight;

    dlq_count := 0;
    IF to_regclass(format('pgmq.q_%s_dlq', base_name)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM pgmq.q_%I_dlq', base_name) INTO dlq_count;
    END IF;

    archived := 0;
    IF to_regclass(format('pgmq.a_%s', base_name)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM pgmq.a_%I', base_name) INTO archived;
    END IF;

    result := result || jsonb_build_object(
      'queue', base_name,
      'queued', queued,
      'in_flight', in_flight,
      'dlq', dlq_count,
      'archived', archived
    );
  END LOOP;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_queue_status() TO service_role;
