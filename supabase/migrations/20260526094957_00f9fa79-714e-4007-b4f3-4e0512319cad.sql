
-- Helper: fan out a notification to all users having any of the given roles
CREATE OR REPLACE FUNCTION public.notify_roles(_roles app_role[], _type text, _title text, _body text, _link text, _data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications(user_id, type, title, body, link, data)
  SELECT DISTINCT ur.user_id, _type, _title, _body, _link, COALESCE(_data, '{}'::jsonb)
  FROM public.user_roles ur
  WHERE ur.role = ANY(_roles);
END $$;

-- Ops: new order
CREATE OR REPLACE FUNCTION public.ops_notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'ops_order',
    'New order received',
    'Order #' || substr(NEW.id::text,1,8) || ' for ' || NEW.total::text || ' ' || NEW.currency,
    '/admin/orders/' || NEW.id::text,
    jsonb_build_object('order_id', NEW.id, 'total', NEW.total, 'currency', NEW.currency)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ops_notify_new_order ON public.orders;
CREATE TRIGGER trg_ops_notify_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.ops_notify_new_order();

-- Ops: new return request
CREATE OR REPLACE FUNCTION public.ops_notify_new_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'ops_return',
    'Return requested',
    'Return for order #' || substr(NEW.order_id::text,1,8) || ' is ' || NEW.status,
    '/admin/returns',
    jsonb_build_object('return_id', NEW.id, 'order_id', NEW.order_id, 'status', NEW.status)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ops_notify_new_return ON public.returns;
CREATE TRIGGER trg_ops_notify_new_return
AFTER INSERT ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.ops_notify_new_return();

-- Ops: low stock
CREATE OR REPLACE FUNCTION public.ops_notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_quantity <= COALESCE(NEW.low_stock_threshold, 5)
     AND (OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity)
     AND NEW.stock_quantity < COALESCE(OLD.stock_quantity, NEW.stock_quantity + 1) THEN
    PERFORM public.notify_roles(
      ARRAY['admin','super_admin','manager','warehouse_staff']::app_role[],
      'ops_low_stock',
      'Low stock: ' || NEW.name,
      NEW.name || ' is at ' || NEW.stock_quantity || ' units (threshold ' || COALESCE(NEW.low_stock_threshold,5) || ')',
      '/admin/products',
      jsonb_build_object('slug', NEW.slug, 'stock_quantity', NEW.stock_quantity)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ops_notify_low_stock ON public.products;
CREATE TRIGGER trg_ops_notify_low_stock
AFTER UPDATE OF stock_quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.ops_notify_low_stock();
