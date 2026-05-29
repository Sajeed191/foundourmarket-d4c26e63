
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_stock_state_expires
  ON public.orders (stock_state, expires_at)
  WHERE stock_state = 'reserved';

-- Reserve stock atomically for an order's items.
CREATE OR REPLACE FUNCTION public.reserve_order_stock(_order_id uuid, _ttl_minutes int DEFAULT 15)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  avail int;
  cur_state text;
BEGIN
  SELECT stock_state INTO cur_state FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF cur_state IS NULL THEN
    RAISE EXCEPTION 'Order % not found', _order_id;
  END IF;
  IF cur_state <> 'none' THEN
    RETURN; -- idempotent: already reserved/committed/released
  END IF;

  -- Lock all product rows first (ordered) to avoid deadlocks, validate availability
  FOR item IN
    SELECT oi.product_slug AS slug, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug
    ORDER BY oi.product_slug
  LOOP
    SELECT (stock_quantity - reserved_quantity) INTO avail
    FROM public.products WHERE slug = item.slug FOR UPDATE;
    IF avail IS NULL THEN
      RAISE EXCEPTION 'Product % unavailable', item.slug;
    END IF;
    IF avail < item.qty THEN
      RAISE EXCEPTION 'Insufficient stock for %', item.slug;
    END IF;
  END LOOP;

  -- Apply reservations
  FOR item IN
    SELECT oi.product_slug AS slug, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug
  LOOP
    UPDATE public.products
    SET reserved_quantity = reserved_quantity + item.qty
    WHERE slug = item.slug;
  END LOOP;

  UPDATE public.orders
  SET stock_state = 'reserved',
      expires_at = now() + make_interval(mins => _ttl_minutes)
  WHERE id = _order_id;
END $$;

-- Release reserved stock (failure / cancel / expire). Idempotent.
CREATE OR REPLACE FUNCTION public.release_order_stock(_order_id uuid, _reason text DEFAULT 'release')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  cur_state text;
BEGIN
  SELECT stock_state INTO cur_state FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF cur_state IS DISTINCT FROM 'reserved' THEN
    RETURN; -- only reserved stock can be released
  END IF;

  FOR item IN
    SELECT oi.product_slug AS slug, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug
    ORDER BY oi.product_slug
  LOOP
    UPDATE public.products
    SET reserved_quantity = GREATEST(0, reserved_quantity - item.qty)
    WHERE slug = item.slug;
  END LOOP;

  UPDATE public.orders SET stock_state = 'released', expires_at = NULL WHERE id = _order_id;
END $$;

-- Commit reserved stock into a permanent decrement (payment confirmed). Idempotent.
CREATE OR REPLACE FUNCTION public.commit_order_stock(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item record;
  cur_state text;
BEGIN
  SELECT stock_state INTO cur_state FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF cur_state IS DISTINCT FROM 'reserved' THEN
    RETURN; -- only reserved stock can be committed
  END IF;

  FOR item IN
    SELECT oi.product_slug AS slug, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug
    ORDER BY oi.product_slug
  LOOP
    UPDATE public.products
    SET stock_quantity = GREATEST(0, stock_quantity - item.qty),
        reserved_quantity = GREATEST(0, reserved_quantity - item.qty),
        in_stock = (stock_quantity - item.qty) > 0
    WHERE slug = item.slug;

    INSERT INTO public.inventory_logs (product_slug, change, reason, reference_id, reference_type)
    VALUES (item.slug, -item.qty, 'order', _order_id, 'order');
  END LOOP;

  UPDATE public.orders SET stock_state = 'committed', expires_at = NULL WHERE id = _order_id;
END $$;

-- Expire stale unpaid reserved orders.
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  n int := 0;
BEGIN
  FOR o IN
    SELECT id FROM public.orders
    WHERE stock_state = 'reserved'
      AND payment_status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now()
    LIMIT 200
  LOOP
    PERFORM public.release_order_stock(o.id, 'expired');
    UPDATE public.orders
      SET status = 'payment_failed', payment_status = 'failed'
      WHERE id = o.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Low stock realtime notifications
DROP TRIGGER IF EXISTS trg_low_stock_notify ON public.products;
CREATE TRIGGER trg_low_stock_notify
AFTER UPDATE OF stock_quantity, reserved_quantity ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.ops_notify_low_stock();
