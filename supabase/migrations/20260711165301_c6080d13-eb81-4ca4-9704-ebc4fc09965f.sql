-- 1) Automatic reservation cleanup worker -------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_order_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.orders
    WHERE stock_state = 'reserved'
      AND expires_at IS NOT NULL
      AND expires_at < now()
    ORDER BY expires_at
    LIMIT 500
  LOOP
    -- release_order_stock is idempotent and only acts on 'reserved' orders,
    -- so committed / already-released orders are never touched.
    PERFORM public.release_order_stock(r.id, 'expired_auto');
    n := n + 1;
  END LOOP;

  IF n > 0 THEN
    INSERT INTO public.security_audit_log (actor_role, action, success, detail)
    VALUES ('system', 'inventory.reservation_cleanup', true,
            jsonb_build_object('released', n, 'at', now()));
  END IF;

  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_expired_order_reservations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_order_reservations() TO service_role;

-- 2) Variant versioning (optimistic locking foundation) -----------------------
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.tg_variant_version_bump()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity
     OR NEW.price_adjustment IS DISTINCT FROM OLD.price_adjustment
     OR NEW.price_override IS DISTINCT FROM OLD.price_override
     OR NEW.active IS DISTINCT FROM OLD.active THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_variant_version_bump ON public.product_variants;
CREATE TRIGGER trg_variant_version_bump
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.tg_variant_version_bump();

-- 3) Inventory audit trail + low-stock notifications --------------------------
CREATE OR REPLACE FUNCTION public.tg_variant_inventory_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  thr int;
  a uuid := auth.uid();
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    -- Audit only admin/manual edits; order automation (commit/release) runs as
    -- the service role with no auth.uid() and logs itself via inventory_logs.
    IF a IS NOT NULL THEN
      INSERT INTO public.inventory_logs (product_slug, variant_id, change, reason, actor_id, notes)
      VALUES (NEW.product_slug, NEW.id, NEW.stock_quantity - OLD.stock_quantity,
              'variant_adjustment', a,
              format('old=%s new=%s sku=%s', OLD.stock_quantity, NEW.stock_quantity, coalesce(NEW.sku, '-')));
    END IF;

    -- Low-stock alert on a downward crossing of the threshold.
    thr := coalesce(NEW.low_stock_threshold, 0);
    IF thr > 0 AND NEW.stock_quantity <= thr AND OLD.stock_quantity > thr THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, priority, data)
      SELECT ur.user_id, 'inventory_low',
             'Low stock: ' || coalesce(NEW.name, NEW.product_slug),
             format('%s (%s) is down to %s units (threshold %s).',
                    coalesce(NEW.name, NEW.product_slug), coalesce(NEW.sku, '—'),
                    NEW.stock_quantity, thr),
             '/admin-product/' || NEW.product_slug || '/variants',
             'high',
             jsonb_build_object('variant_id', NEW.id, 'product_slug', NEW.product_slug,
                                'stock', NEW.stock_quantity, 'threshold', thr)
      FROM public.user_roles ur
      WHERE ur.role IN ('admin', 'super_admin');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_variant_inventory_audit ON public.product_variants;
CREATE TRIGGER trg_variant_inventory_audit
  AFTER UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.tg_variant_inventory_audit();