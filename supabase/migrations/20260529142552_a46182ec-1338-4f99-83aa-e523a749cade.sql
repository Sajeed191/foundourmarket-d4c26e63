-- Harden order writes against price tampering.
-- Order creation now happens exclusively through trusted server functions that
-- recompute prices from the products table. Direct user writes via the Data API
-- must be denied so attackers cannot insert/alter arbitrary totals.

-- Remove direct user INSERT on orders (server functions use the service role).
DROP POLICY IF EXISTS "own orders insert" ON public.orders;

-- Remove direct user UPDATE on orders (status/total changes are server-only;
-- admins retain their separate "admins update all orders" policy).
DROP POLICY IF EXISTS "own orders update" ON public.orders;

-- Remove direct user INSERT on order_items (written server-side via service role).
DROP POLICY IF EXISTS "own order items insert" ON public.order_items;

-- Defense-in-depth: ensure each line_total matches unit_price * quantity so
-- even a future privileged path cannot persist mismatched figures.
CREATE OR REPLACE FUNCTION public.validate_order_item_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.unit_price < 0 OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid order item quantity or price';
  END IF;
  IF NEW.line_total <> NEW.unit_price * NEW.quantity THEN
    RAISE EXCEPTION 'line_total must equal unit_price * quantity';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_item_totals ON public.order_items;
CREATE TRIGGER validate_order_item_totals
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_item_totals();