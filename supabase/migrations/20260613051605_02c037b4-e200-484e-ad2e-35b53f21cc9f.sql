CREATE OR REPLACE FUNCTION public.svc_database_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'counts', jsonb_build_object(
      'orders',    (SELECT count(*) FROM public.orders),
      'payments',  (SELECT count(*) FROM public.payments),
      'shipments', (SELECT count(*) FROM public.shipments),
      'customers', (SELECT count(*) FROM public.profiles),
      'products',  (SELECT count(*) FROM public.products)
    ),
    'integrity', jsonb_build_object(
      'orphan_payments', (
        SELECT count(*) FROM public.payments p
        WHERE p.order_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p.order_id)
      ),
      'orphan_order_items', (
        SELECT count(*) FROM public.order_items oi
        WHERE oi.order_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = oi.order_id)
      ),
      'orphan_shipments', (
        SELECT count(*) FROM public.shipments s
        WHERE s.order_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = s.order_id)
      )
    ),
    'errors', jsonb_build_object(
      'failed_orders', (
        SELECT count(*) FROM public.orders
        WHERE status IN ('failed','cancelled')
          AND created_at > now() - interval '30 days'
      ),
      'failed_payments', (
        SELECT count(*) FROM public.payments
        WHERE status = 'failed'
          AND created_at > now() - interval '30 days'
      ),
      'failed_emails', (
        SELECT count(*) FROM public.email_send_log
        WHERE status IN ('dlq','failed','bounced','complained')
          AND created_at > now() - interval '30 days'
      ),
      'pending_emails', (
        SELECT count(*) FROM public.email_send_log
        WHERE status = 'pending'
          AND created_at > now() - interval '30 days'
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.svc_database_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svc_database_health() TO authenticated, service_role;