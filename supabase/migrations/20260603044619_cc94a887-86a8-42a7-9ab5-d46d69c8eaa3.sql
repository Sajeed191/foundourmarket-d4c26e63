-- =====================================================================
-- HARDEN ORDER CANCELLATION + FULFILLMENT WORKFLOW
-- =====================================================================

-- 1. Customer cancellation window -------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_window_expires_at timestamptz;

UPDATE public.orders
  SET cancel_window_expires_at = created_at + interval '1 hour'
  WHERE cancel_window_expires_at IS NULL;

-- Auto-set the window on every new order (created_at + 1 hour).
CREATE OR REPLACE FUNCTION public.set_cancel_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cancel_window_expires_at IS NULL THEN
    NEW.cancel_window_expires_at := COALESCE(NEW.created_at, now()) + interval '1 hour';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_cancel_window ON public.orders;
CREATE TRIGGER trg_set_cancel_window
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_cancel_window();

-- 2. Lifecycle step ordering helper -----------------------------------
CREATE OR REPLACE FUNCTION public.order_lifecycle_step(_status text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_status,''))
    WHEN 'pending' THEN 1
    WHEN 'confirmed' THEN 2
    WHEN 'processing' THEN 3
    WHEN 'packed' THEN 4
    WHEN 'shipped' THEN 5
    WHEN 'out_for_delivery' THEN 6
    WHEN 'delivered' THEN 7
    WHEN 'completed' THEN 8
    ELSE 0
  END
$$;

-- 3. Sequential transition enforcement (no skipping steps) ------------
CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_step int := public.order_lifecycle_step(OLD.status);
  new_step int := public.order_lifecycle_step(NEW.status);
BEGIN
  -- No change → nothing to enforce.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Side / terminal states are reachable from anywhere.
  IF lower(coalesce(NEW.status,'')) IN
     ('cancelled','canceled','refunded','returned','payment_failed','expired','abandoned') THEN
    RETURN NEW;
  END IF;

  -- Both endpoints are lifecycle steps → must advance by exactly one.
  IF old_step > 0 AND new_step > 0 THEN
    IF new_step <> old_step + 1 THEN
      RAISE EXCEPTION
        'Invalid order status transition: % -> %. Fulfilment steps must advance one stage at a time.',
        OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Re-entering the lifecycle from a side/unknown state (e.g. payment
  -- recovery) is only allowed at the early entry stages.
  IF old_step = 0 AND new_step > 0 AND new_step > 3 THEN
    RAISE EXCEPTION
      'Invalid order status transition: % -> %. Orders must re-enter fulfilment at an early stage.',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;
CREATE TRIGGER trg_enforce_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- 4. Customer cancellation (window + ownership + status enforced) -----
CREATE OR REPLACE FUNCTION public.customer_cancel_order(_order_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF o.user_id IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'You are not authorized to cancel this order.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Only pending / confirmed orders are cancellable by the customer.
  IF lower(coalesce(o.status,'')) NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'This order can no longer be cancelled because processing has started.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Hard 1-hour window.
  IF now() >= coalesce(o.cancel_window_expires_at, o.created_at + interval '1 hour') THEN
    RAISE EXCEPTION 'This order can no longer be cancelled because processing has started.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.orders
    SET status = 'cancelled',
        fulfillment_status = 'cancelled',
        cancelled_at = now()
    WHERE id = _order_id;

  -- Release any reserved stock (no-op if not reserved).
  BEGIN
    PERFORM public.release_order_stock(_order_id, 'customer_cancel');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO public.admin_activity_logs (action, entity_type, entity_id, metadata)
  VALUES ('customer_order_cancel', 'orders', _order_id::text,
          jsonb_build_object('user_id', _user_id, 'cancelled_at', now()));

  RETURN jsonb_build_object('ok', true, 'cancelled_at', now());
END $$;

REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid, uuid) TO service_role;

-- 5. Lifecycle backfill / repair report -------------------------------
CREATE OR REPLACE FUNCTION public.backfill_order_lifecycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scanned        int := 0;
  fixed_sync     int := 0;
  fixed_ofd      int := 0;
  needs_review   jsonb := '[]'::jsonb;
  r              record;
BEGIN
  SELECT count(*)::int INTO scanned FROM public.orders;

  -- Backfill cancel windows.
  UPDATE public.orders
    SET cancel_window_expires_at = created_at + interval '1 hour'
    WHERE cancel_window_expires_at IS NULL;

  -- Sync delivered orders so fulfillment_status matches a delivered status.
  FOR r IN
    SELECT id FROM public.orders
    WHERE lower(coalesce(status,'')) = 'delivered'
      AND lower(coalesce(fulfillment_status,'')) <> 'delivered'
  LOOP
    UPDATE public.orders SET fulfillment_status = 'delivered' WHERE id = r.id;
    fixed_sync := fixed_sync + 1;
  END LOOP;

  -- Backfill missing out_for_delivery shipment timestamps where a shipment
  -- shows out_for_delivery but has no recorded timestamp via events.
  FOR r IN
    SELECT s.id
    FROM public.shipments s
    WHERE lower(coalesce(s.status,'')) = 'out_for_delivery'
      AND NOT EXISTS (
        SELECT 1 FROM public.shipment_events e
        WHERE e.shipment_id = s.id AND lower(coalesce(e.status,'')) LIKE 'out_for%'
      )
  LOOP
    INSERT INTO public.shipment_events (shipment_id, status, description, source)
    VALUES (r.id, 'out_for_delivery', 'Out for delivery (backfilled)', 'system');
    fixed_ofd := fixed_ofd + 1;
  END LOOP;

  -- Orders that violate payment safety → flag for manual review.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_id', id, 'status', status, 'payment_status', payment_status)), '[]'::jsonb)
    INTO needs_review
  FROM public.orders
  WHERE (lower(coalesce(status,'')) = ANY (ARRAY['shipped','out_for_delivery','delivered','completed','processing','packed'])
         OR lower(coalesce(fulfillment_status,'')) = ANY (ARRAY['shipped','out_for_delivery','delivered','completed','processing','packed']))
    AND NOT public.payment_allows_fulfillment(payment_status, payment_method);

  INSERT INTO public.admin_activity_logs (action, entity_type, metadata)
  VALUES ('order_lifecycle_backfill', 'orders',
          jsonb_build_object(
            'scanned', scanned,
            'fixed_status_sync', fixed_sync,
            'fixed_out_for_delivery', fixed_ofd,
            'awaiting_manual_review', needs_review,
            'awaiting_count', jsonb_array_length(needs_review),
            'ran_at', now()));

  RETURN jsonb_build_object(
    'scanned', scanned,
    'fixed_status_sync', fixed_sync,
    'fixed_out_for_delivery', fixed_ofd,
    'awaiting_manual_review', needs_review,
    'awaiting_count', jsonb_array_length(needs_review));
END $$;

REVOKE ALL ON FUNCTION public.backfill_order_lifecycle() FROM public;
GRANT EXECUTE ON FUNCTION public.backfill_order_lifecycle() TO service_role;