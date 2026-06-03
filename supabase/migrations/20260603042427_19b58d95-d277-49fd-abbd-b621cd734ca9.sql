
-- ============================================================
-- Order ⇆ Payment ⇆ Fulfillment state-machine protection
-- ============================================================

-- 1. Payment-validity helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_allows_fulfillment(_payment_status text, _payment_method text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(lower(_payment_method), '') = 'cod'
      OR lower(COALESCE(_payment_status, '')) = ANY (ARRAY['paid','authorized','succeeded','cod']);
$$;

-- Canonical lists of "fulfillment stage" values
-- order.status stages:        processing, fulfilled, shipped, out_for_delivery, delivered, completed
-- order.fulfillment_status:   processing, packed, shipped, out_for_delivery, delivered, fulfilled, completed

-- 2. Order guard -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_fulfillment_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  order_stage   boolean := lower(COALESCE(NEW.status, '')) = ANY (
                  ARRAY['processing','fulfilled','shipped','out_for_delivery','delivered','completed']);
  fulfill_stage boolean := lower(COALESCE(NEW.fulfillment_status, '')) = ANY (
                  ARRAY['processing','packed','shipped','out_for_delivery','delivered','fulfilled','completed']);
BEGIN
  IF (order_stage OR fulfill_stage)
     AND NOT public.payment_allows_fulfillment(NEW.payment_status, NEW.payment_method) THEN
    RAISE EXCEPTION
      'This order cannot be fulfilled because payment has not been completed (payment_status=%, payment_method=%).',
      COALESCE(NEW.payment_status, 'null'), COALESCE(NEW.payment_method, 'null')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_fulfillment_payment ON public.orders;
CREATE TRIGGER trg_enforce_order_fulfillment_payment
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_fulfillment_payment();

-- 3. Shipment guard ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_shipment_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ps text;
  pm text;
BEGIN
  -- De-fulfillment transitions are always permitted
  IF lower(COALESCE(NEW.status, '')) = ANY (ARRAY['cancelled','canceled','returned']) THEN
    RETURN NEW;
  END IF;

  SELECT payment_status, payment_method INTO ps, pm
    FROM public.orders WHERE id = NEW.order_id;

  IF NOT public.payment_allows_fulfillment(ps, pm) THEN
    RAISE EXCEPTION
      'Cannot create or progress shipment: payment for this order has failed or is incomplete (payment_status=%).',
      COALESCE(ps, 'null')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_shipment_payment ON public.shipments;
CREATE TRIGGER trg_enforce_shipment_payment
  BEFORE INSERT OR UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_shipment_payment();

-- 4. Integrity checker -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_order_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivered_failed jsonb;
  shipped_failed   jsonb;
  refunded_active  jsonb;
  cancelled_deliv  jsonb;
  total            integer;
  summary          jsonb;
BEGIN
  -- delivered order + failed payment
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', id, 'payment_status', payment_status)), '[]'::jsonb)
    INTO delivered_failed
  FROM public.orders
  WHERE lower(COALESCE(status,'')) = 'delivered'
     OR lower(COALESCE(fulfillment_status,'')) = 'delivered'
  AND NOT public.payment_allows_fulfillment(payment_status, payment_method);

  -- recompute correctly (status OR fulfillment delivered) AND payment invalid
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', id, 'payment_status', payment_status)), '[]'::jsonb)
    INTO delivered_failed
  FROM public.orders
  WHERE (lower(COALESCE(status,'')) = 'delivered' OR lower(COALESCE(fulfillment_status,'')) = 'delivered')
    AND NOT public.payment_allows_fulfillment(payment_status, payment_method);

  -- shipped/out_for_delivery order + invalid payment
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', id, 'payment_status', payment_status)), '[]'::jsonb)
    INTO shipped_failed
  FROM public.orders
  WHERE (lower(COALESCE(status,'')) = ANY (ARRAY['shipped','out_for_delivery','processing','fulfilled','completed'])
         OR lower(COALESCE(fulfillment_status,'')) = ANY (ARRAY['shipped','out_for_delivery','processing','packed','fulfilled','completed']))
    AND NOT public.payment_allows_fulfillment(payment_status, payment_method);

  -- refunded order with an active (not cancelled/returned) shipment
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', o.id, 'shipment_id', s.id, 'shipment_status', s.status)), '[]'::jsonb)
    INTO refunded_active
  FROM public.orders o
  JOIN public.shipments s ON s.order_id = o.id
  WHERE lower(COALESCE(o.payment_status,'')) = 'refunded'
    AND lower(COALESCE(s.status,'')) NOT IN ('cancelled','canceled','returned');

  -- cancelled order shown as delivered
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', id)), '[]'::jsonb)
    INTO cancelled_deliv
  FROM public.orders
  WHERE lower(COALESCE(status,'')) IN ('cancelled','canceled')
    AND lower(COALESCE(fulfillment_status,'')) = 'delivered';

  total := jsonb_array_length(delivered_failed)
         + jsonb_array_length(shipped_failed)
         + jsonb_array_length(refunded_active)
         + jsonb_array_length(cancelled_deliv);

  summary := jsonb_build_object(
    'scanned_at', now(),
    'invalid_total', total,
    'delivered_with_failed_payment', delivered_failed,
    'shipped_with_failed_payment', shipped_failed,
    'refunded_with_active_shipment', refunded_active,
    'cancelled_marked_delivered', cancelled_deliv
  );

  INSERT INTO public.admin_activity_logs (action, entity_type, metadata)
  VALUES ('order_integrity_scan', 'orders', summary);

  RETURN summary;
END;
$$;

-- 5. Staff-gated reader for the dashboard ------------------------------------
CREATE OR REPLACE FUNCTION public.svc_order_integrity(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_scan jsonb;
  last_at   timestamptz;
  live_invalid integer;
BEGIN
  IF NOT has_any_role(_actor, ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT metadata, created_at INTO last_scan, last_at
  FROM public.admin_activity_logs
  WHERE action = 'order_integrity_scan'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT count(*) INTO live_invalid
  FROM public.orders
  WHERE (lower(COALESCE(status,'')) = ANY (ARRAY['processing','fulfilled','shipped','out_for_delivery','delivered','completed'])
         OR lower(COALESCE(fulfillment_status,'')) = ANY (ARRAY['processing','packed','shipped','out_for_delivery','delivered','fulfilled','completed']))
    AND NOT public.payment_allows_fulfillment(payment_status, payment_method);

  RETURN jsonb_build_object(
    'last_scan', last_scan,
    'last_scan_at', last_at,
    'live_invalid_count', live_invalid
  );
END;
$$;

-- Reader RPC is service-role only (called from a staff-gated server fn)
REVOKE ALL ON FUNCTION public.svc_order_integrity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_order_integrity(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.check_order_integrity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_order_integrity() TO service_role;
