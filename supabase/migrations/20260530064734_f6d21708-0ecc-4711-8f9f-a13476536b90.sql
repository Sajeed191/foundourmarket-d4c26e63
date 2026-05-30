-- 1. Priority + archive support on notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_user_state
  ON public.notifications (user_id, archived_at, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_priority
  ON public.notifications (user_id, priority);

-- 2. notify_roles gains an optional priority arg (existing callers keep working)
CREATE OR REPLACE FUNCTION public.notify_roles(_roles app_role[], _type text, _title text, _body text, _link text, _data jsonb, _priority text DEFAULT 'normal')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications(user_id, type, title, body, link, data, priority)
  SELECT DISTINCT ur.user_id, _type, _title, _body, _link, COALESCE(_data, '{}'::jsonb), COALESCE(_priority,'normal')
  FROM public.user_roles ur
  WHERE ur.role = ANY(_roles);
END $function$;

-- 3. New order: critical when high-value
CREATE OR REPLACE FUNCTION public.ops_notify_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _prio text;
BEGIN
  _prio := CASE WHEN NEW.total >= 25000 THEN 'critical' ELSE 'important' END;
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'ops_order',
    CASE WHEN NEW.total >= 25000 THEN 'High-value order received' ELSE 'New order received' END,
    'Order #' || substr(NEW.id::text,1,8) || ' for ' || NEW.total::text || ' ' || NEW.currency,
    '/admin/orders/' || NEW.id::text,
    jsonb_build_object('order_id', NEW.id, 'total', NEW.total, 'currency', NEW.currency),
    _prio
  );
  RETURN NEW;
END $function$;

-- 4. Low stock: critical when fully out of stock
CREATE OR REPLACE FUNCTION public.ops_notify_low_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stock_quantity <= COALESCE(NEW.low_stock_threshold, 5)
     AND (OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity)
     AND NEW.stock_quantity < COALESCE(OLD.stock_quantity, NEW.stock_quantity + 1) THEN
    PERFORM public.notify_roles(
      ARRAY['admin','super_admin','manager','warehouse_staff']::app_role[],
      'ops_low_stock',
      CASE WHEN NEW.stock_quantity <= 0 THEN 'Out of stock: ' || NEW.name ELSE 'Low stock: ' || NEW.name END,
      NEW.name || ' is at ' || NEW.stock_quantity || ' units (threshold ' || COALESCE(NEW.low_stock_threshold,5) || ')',
      '/admin-inventory',
      jsonb_build_object('slug', NEW.slug, 'stock_quantity', NEW.stock_quantity),
      CASE WHEN NEW.stock_quantity <= 0 THEN 'critical' ELSE 'important' END
    );
  END IF;
  RETURN NEW;
END $function$;

-- 5. Returns: important
CREATE OR REPLACE FUNCTION public.ops_notify_new_return()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'ops_return',
    'Return requested',
    'Return for order #' || substr(NEW.order_id::text,1,8) || ' is ' || NEW.status,
    '/admin-returns',
    jsonb_build_object('return_id', NEW.id, 'order_id', NEW.order_id, 'status', NEW.status),
    'important'
  );
  RETURN NEW;
END $function$;

-- 6. Reviews: negative reviews are important
CREATE OR REPLACE FUNCTION public.notify_staff_new_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'review',
    CASE WHEN NEW.rating <= 2 THEN 'Negative review (' || NEW.rating || '★)' ELSE 'New product review' END,
    'A customer left a ' || NEW.rating || '★ review on ' || NEW.product_slug,
    '/products/' || NEW.product_slug || '#reviews',
    jsonb_build_object('review_id', NEW.id, 'product_slug', NEW.product_slug, 'rating', NEW.rating),
    CASE WHEN NEW.rating <= 2 THEN 'important' ELSE 'normal' END
  );
  RETURN NEW;
END $function$;

-- 7. Admin notification preferences (one row per staff member)
CREATE TABLE IF NOT EXISTS public.admin_notification_prefs (
  user_id uuid NOT NULL PRIMARY KEY,
  mode text NOT NULL DEFAULT 'all',
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_critical boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notification_prefs TO authenticated;
GRANT ALL ON public.admin_notification_prefs TO service_role;

ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own notification prefs"
ON public.admin_notification_prefs
FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff','editor']::app_role[]))
WITH CHECK (auth.uid() = user_id AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff','editor']::app_role[]));

CREATE TRIGGER admin_notification_prefs_updated_at
BEFORE UPDATE ON public.admin_notification_prefs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();