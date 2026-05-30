-- 1. SECURITY FIX: lock down privileged marketing automation RPC.
-- The (boolean, text) overload currently grants EXECUTE to PUBLIC, anon and
-- authenticated. Revoke so only service_role / postgres (cron + server-side
-- privileged paths) can execute it directly.
REVOKE EXECUTE ON FUNCTION public.run_marketing_automations(boolean, text)
  FROM anon, authenticated, PUBLIC;

-- Keep service-role automation + cron able to execute (already granted; re-assert).
GRANT EXECUTE ON FUNCTION public.run_marketing_automations(boolean, text) TO service_role;

-- (The 3-arg overload is already restricted to postgres/service_role only.)

-- 2. PERFORMANCE FIX
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items(order_id);

-- 3. INVENTORY ANALYTICS INDEX
CREATE INDEX IF NOT EXISTS idx_inventory_logs_slug
  ON public.inventory_logs(product_slug);

-- 4. SECURITY DEFINER HARDENING: pin search_path on email-queue functions.
-- These touch pgmq, so include it explicitly. No body/logic changes.
ALTER FUNCTION public.enqueue_email(text, jsonb)            SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint)           SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;