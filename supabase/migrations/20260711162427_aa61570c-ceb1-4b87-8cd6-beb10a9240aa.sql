-- Phase 3: variant-aware order snapshots + per-variant inventory reservations

-- 1. order_items: immutable variant snapshot (all nullable => historical/non-variant rows untouched)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid,
  ADD COLUMN IF NOT EXISTS variant_name text,
  ADD COLUMN IF NOT EXISTS variant_size text,
  ADD COLUMN IF NOT EXISTS variant_color text,
  ADD COLUMN IF NOT EXISTS variant_sku text,
  ADD COLUMN IF NOT EXISTS variant_image text;

-- 2. product_variants: per-variant reservation counter
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS reserved_quantity int NOT NULL DEFAULT 0;

-- 3. Variant-aware reserve. Non-variant lines (variant_id IS NULL) keep the
--    exact product-level behavior; variant lines gate on product_variants.
CREATE OR REPLACE FUNCTION public.reserve_order_stock(_order_id uuid, _ttl_minutes integer DEFAULT 15)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RETURN; -- idempotent
  END IF;

  -- Validate availability (locked, ordered to avoid deadlocks)
  FOR item IN
    SELECT oi.product_slug AS slug, oi.variant_id AS variant_id, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug, oi.variant_id
    ORDER BY oi.product_slug, oi.variant_id
  LOOP
    IF item.variant_id IS NOT NULL THEN
      SELECT (stock_quantity - reserved_quantity) INTO avail
      FROM public.product_variants WHERE id = item.variant_id FOR UPDATE;
      IF avail IS NULL THEN
        RAISE EXCEPTION 'Variant % unavailable', item.variant_id;
      END IF;
      IF avail < item.qty THEN
        RAISE EXCEPTION 'Insufficient stock for %', item.slug;
      END IF;
    ELSE
      SELECT (stock_quantity - reserved_quantity) INTO avail
      FROM public.products WHERE slug = item.slug FOR UPDATE;
      IF avail IS NULL THEN
        RAISE EXCEPTION 'Product % unavailable', item.slug;
      END IF;
      IF avail < item.qty THEN
        RAISE EXCEPTION 'Insufficient stock for %', item.slug;
      END IF;
    END IF;
  END LOOP;

  -- Apply reservations
  FOR item IN
    SELECT oi.product_slug AS slug, oi.variant_id AS variant_id, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug, oi.variant_id
  LOOP
    IF item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET reserved_quantity = reserved_quantity + item.qty
      WHERE id = item.variant_id;
    ELSE
      UPDATE public.products
      SET reserved_quantity = reserved_quantity + item.qty
      WHERE slug = item.slug;
    END IF;
  END LOOP;

  UPDATE public.orders
  SET stock_state = 'reserved',
      expires_at = now() + make_interval(mins => _ttl_minutes)
  WHERE id = _order_id;
END $function$;

-- 4. Variant-aware commit
CREATE OR REPLACE FUNCTION public.commit_order_stock(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item record;
  cur_state text;
BEGIN
  SELECT stock_state INTO cur_state FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF cur_state IS DISTINCT FROM 'reserved' THEN
    RETURN;
  END IF;

  FOR item IN
    SELECT oi.product_slug AS slug, oi.variant_id AS variant_id, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug, oi.variant_id
    ORDER BY oi.product_slug, oi.variant_id
  LOOP
    IF item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock_quantity = GREATEST(0, stock_quantity - item.qty),
          reserved_quantity = GREATEST(0, reserved_quantity - item.qty)
      WHERE id = item.variant_id;
    ELSE
      UPDATE public.products
      SET stock_quantity = GREATEST(0, stock_quantity - item.qty),
          reserved_quantity = GREATEST(0, reserved_quantity - item.qty),
          in_stock = (stock_quantity - item.qty) > 0
      WHERE slug = item.slug;
    END IF;

    INSERT INTO public.inventory_logs (product_slug, change, reason, reference_id, reference_type)
    VALUES (item.slug, -item.qty, 'order', _order_id, 'order');
  END LOOP;

  UPDATE public.orders SET stock_state = 'committed', expires_at = NULL WHERE id = _order_id;
END $function$;

-- 5. Variant-aware release
CREATE OR REPLACE FUNCTION public.release_order_stock(_order_id uuid, _reason text DEFAULT 'release'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item record;
  cur_state text;
BEGIN
  SELECT stock_state INTO cur_state FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF cur_state IS DISTINCT FROM 'reserved' THEN
    RETURN;
  END IF;

  FOR item IN
    SELECT oi.product_slug AS slug, oi.variant_id AS variant_id, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
    GROUP BY oi.product_slug, oi.variant_id
    ORDER BY oi.product_slug, oi.variant_id
  LOOP
    IF item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET reserved_quantity = GREATEST(0, reserved_quantity - item.qty)
      WHERE id = item.variant_id;
    ELSE
      UPDATE public.products
      SET reserved_quantity = GREATEST(0, reserved_quantity - item.qty)
      WHERE slug = item.slug;
    END IF;
  END LOOP;

  UPDATE public.orders SET stock_state = 'released', expires_at = NULL WHERE id = _order_id;
END $function$;