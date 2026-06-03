
-- ============================================================
-- 1. ANALYTICS: flash_deal_events
-- ============================================================
CREATE TABLE public.flash_deal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid REFERENCES public.flash_deals(id) ON DELETE SET NULL,
  product_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('impression','click','purchase')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.flash_deal_events TO anon;
GRANT SELECT, INSERT ON public.flash_deal_events TO authenticated;
GRANT ALL ON public.flash_deal_events TO service_role;

ALTER TABLE public.flash_deal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can record flash deal events"
ON public.flash_deal_events FOR INSERT
TO anon, authenticated
WITH CHECK (event_type IN ('impression','click','purchase'));

CREATE POLICY "managers view flash deal events"
ON public.flash_deal_events FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]));

CREATE INDEX flash_deal_events_deal_idx ON public.flash_deal_events (deal_id);
CREATE INDEX flash_deal_events_type_time_idx ON public.flash_deal_events (event_type, created_at DESC);
CREATE INDEX flash_deal_events_product_idx ON public.flash_deal_events (product_id);

-- ============================================================
-- 2. AUDIT LOG: flash_deal_audit_log
-- ============================================================
CREATE TABLE public.flash_deal_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at timestamptz NOT NULL DEFAULT now(),
  expired_deactivated integer NOT NULL DEFAULT 0,
  invalid_product_deactivated integer NOT NULL DEFAULT 0,
  out_of_stock_deactivated integer NOT NULL DEFAULT 0,
  duplicates_found integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.flash_deal_audit_log TO authenticated;
GRANT ALL ON public.flash_deal_audit_log TO service_role;

ALTER TABLE public.flash_deal_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers view flash deal audit log"
ON public.flash_deal_audit_log FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]));

CREATE INDEX flash_deal_audit_log_ran_idx ON public.flash_deal_audit_log (ran_at DESC);

-- ============================================================
-- 3. INVENTORY TRIGGER: deactivate deals when stock hits 0
-- ============================================================
CREATE OR REPLACE FUNCTION public.flash_deals_on_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
      OR NEW.in_stock IS DISTINCT FROM OLD.in_stock
      OR NEW.status IS DISTINCT FROM OLD.status) THEN
    IF (COALESCE(NEW.stock_quantity, 0) <= 0
        OR NEW.in_stock = false
        OR NEW.status <> 'published') THEN
      UPDATE public.flash_deals
      SET active = false
      WHERE product_id = NEW.id AND active = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flash_deals_on_stock_change ON public.products;
CREATE TRIGGER trg_flash_deals_on_stock_change
AFTER UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.flash_deals_on_stock_change();

-- ============================================================
-- 4. DAILY AUDIT FUNCTION (repairs + logs)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_flash_deals()
RETURNS public.flash_deal_audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expired integer := 0;
  v_invalid integer := 0;
  v_oos integer := 0;
  v_dupes integer := 0;
  v_row public.flash_deal_audit_log;
BEGIN
  -- Expired but still active
  UPDATE public.flash_deals
  SET active = false
  WHERE active = true AND end_at < now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- Active deals whose product is missing or unpublished
  UPDATE public.flash_deals fd
  SET active = false
  WHERE fd.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = fd.product_id AND p.status = 'published'
    );
  GET DIAGNOSTICS v_invalid = ROW_COUNT;

  -- Active deals with zero / no stock
  UPDATE public.flash_deals fd
  SET active = false
  FROM public.products p
  WHERE fd.product_id = p.id
    AND fd.active = true
    AND (COALESCE(p.stock_quantity, 0) <= 0 OR p.in_stock = false);
  GET DIAGNOSTICS v_oos = ROW_COUNT;

  -- Duplicate active deals per product (should be impossible via unique index)
  SELECT COALESCE(SUM(cnt - 1), 0) INTO v_dupes
  FROM (
    SELECT product_id, count(*) AS cnt
    FROM public.flash_deals
    WHERE active = true
    GROUP BY product_id
    HAVING count(*) > 1
  ) d;

  INSERT INTO public.flash_deal_audit_log
    (expired_deactivated, invalid_product_deactivated, out_of_stock_deactivated, duplicates_found, details)
  VALUES (v_expired, v_invalid, v_oos, v_dupes,
    jsonb_build_object('source','scheduled'))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ============================================================
-- 5. SCHEDULE: replace simple expire job with full daily audit
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-flash-deal-refresh');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-flash-deal-audit');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-flash-deal-audit',
  '5 0 * * *',
  $$ SELECT public.audit_flash_deals(); $$
);
