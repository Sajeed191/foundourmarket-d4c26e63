-- ============================================================
-- Customer 360 Intelligence Center
-- Supporting indexes for fast per-customer aggregation & search
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_user_id ON public.shipments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_returns_user_id ON public.returns USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets USING btree (status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_subject_id ON public.fraud_alerts USING btree (subject_id);
CREATE INDEX IF NOT EXISTS idx_addresses_line1_trgm ON public.addresses USING gin (line1 gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_addresses_city_trgm ON public.addresses USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_addresses_postal_trgm ON public.addresses USING gin (postal gin_trgm_ops);

-- ============================================================
-- Customer list: KPIs + paginated, searchable customer roster
-- ============================================================
CREATE OR REPLACE FUNCTION public.svc_customer_center(
  _actor uuid,
  _search text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_staff boolean;
  _q text;
  _kpis jsonb;
  _rows jsonb;
  _total bigint;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _actor AND role IN ('admin','super_admin','manager')
  ) INTO _is_staff;
  IF NOT _is_staff THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := nullif(btrim(coalesce(_search, '')), '');
  _limit := least(greatest(coalesce(_limit, 50), 1), 200);
  _offset := greatest(coalesce(_offset, 0), 0);

  SELECT jsonb_build_object(
    'total_customers', (SELECT count(*) FROM profiles),
    'paying_customers', (SELECT count(DISTINCT user_id) FROM payments WHERE status = 'succeeded'),
    'total_revenue', (SELECT coalesce(sum(amount),0) FROM payments WHERE status = 'succeeded'),
    'open_tickets', (SELECT count(*) FROM support_tickets WHERE status NOT IN ('resolved','closed')),
    'new_today', (SELECT count(*) FROM profiles WHERE created_at >= date_trunc('day', now()))
  ) INTO _kpis;

  WITH base AS (
    SELECT pr.id
    FROM profiles pr
    LEFT JOIN auth.users au ON au.id = pr.id
    WHERE _q IS NULL
       OR pr.full_name ILIKE '%'||_q||'%'
       OR pr.phone ILIKE '%'||_q||'%'
       OR au.email ILIKE '%'||_q||'%'
       OR pr.id::text ILIKE '%'||_q||'%'
       OR EXISTS (SELECT 1 FROM orders o WHERE o.user_id = pr.id
            AND (o.id::text ILIKE '%'||_q||'%' OR o.contact_email ILIKE '%'||_q||'%'
                 OR o.tracking_number ILIKE '%'||_q||'%' OR o.razorpay_payment_id ILIKE '%'||_q||'%'))
       OR EXISTS (SELECT 1 FROM payments p WHERE p.user_id = pr.id
            AND (p.transaction_id ILIKE '%'||_q||'%' OR p.razorpay_payment_id ILIKE '%'||_q||'%'))
       OR EXISTS (SELECT 1 FROM shipments s WHERE s.user_id = pr.id AND s.tracking_number ILIKE '%'||_q||'%')
       OR EXISTS (SELECT 1 FROM addresses a WHERE a.user_id = pr.id
            AND (a.line1 ILIKE '%'||_q||'%' OR a.city ILIKE '%'||_q||'%' OR a.postal ILIKE '%'||_q||'%'))
  )
  SELECT count(*) INTO _total FROM base;

  WITH base AS (
    SELECT pr.id, pr.full_name, pr.phone, pr.country, pr.created_at, au.email, au.last_sign_in_at
    FROM profiles pr
    LEFT JOIN auth.users au ON au.id = pr.id
    WHERE _q IS NULL
       OR pr.full_name ILIKE '%'||_q||'%'
       OR pr.phone ILIKE '%'||_q||'%'
       OR au.email ILIKE '%'||_q||'%'
       OR pr.id::text ILIKE '%'||_q||'%'
       OR EXISTS (SELECT 1 FROM orders o WHERE o.user_id = pr.id
            AND (o.id::text ILIKE '%'||_q||'%' OR o.contact_email ILIKE '%'||_q||'%'
                 OR o.tracking_number ILIKE '%'||_q||'%' OR o.razorpay_payment_id ILIKE '%'||_q||'%'))
       OR EXISTS (SELECT 1 FROM payments p WHERE p.user_id = pr.id
            AND (p.transaction_id ILIKE '%'||_q||'%' OR p.razorpay_payment_id ILIKE '%'||_q||'%'))
       OR EXISTS (SELECT 1 FROM shipments s WHERE s.user_id = pr.id AND s.tracking_number ILIKE '%'||_q||'%')
       OR EXISTS (SELECT 1 FROM addresses a WHERE a.user_id = pr.id
            AND (a.line1 ILIKE '%'||_q||'%' OR a.city ILIKE '%'||_q||'%' OR a.postal ILIKE '%'||_q||'%'))
  ), agg AS (
    SELECT b.*,
      (SELECT count(*) FROM orders o WHERE o.user_id = b.id) AS total_orders,
      (SELECT coalesce(sum(p.amount),0) FROM payments p WHERE p.user_id = b.id AND p.status = 'succeeded') AS lifetime_spend,
      (SELECT count(*) FROM payments p WHERE p.user_id = b.id AND p.status = 'succeeded') AS successful_payments,
      (SELECT count(*) FROM refunds r JOIN orders o ON o.id = r.order_id WHERE o.user_id = b.id) AS refund_count,
      (SELECT count(*) FROM support_tickets t WHERE t.user_id = b.id AND t.status NOT IN ('resolved','closed')) AS open_tickets,
      (SELECT coalesce(max(f.score),0) FROM fraud_alerts f WHERE f.subject_id = b.id::text AND f.status <> 'resolved') AS risk_score,
      (SELECT max(o.created_at) FROM orders o WHERE o.user_id = b.id) AS last_order
    FROM base b
  )
  SELECT coalesce(jsonb_agg(row ORDER BY last_active DESC NULLS LAST), '[]'::jsonb) INTO _rows
  FROM (
    SELECT
      greatest(coalesce(last_sign_in_at, to_timestamp(0)), coalesce(last_order, to_timestamp(0))) AS last_active,
      jsonb_build_object(
        'id', id, 'full_name', full_name, 'email', email, 'phone', phone, 'country', country,
        'total_orders', total_orders, 'lifetime_spend', lifetime_spend,
        'successful_payments', successful_payments, 'refund_count', refund_count,
        'open_tickets', open_tickets, 'risk_score', risk_score,
        'last_active', greatest(coalesce(last_sign_in_at, to_timestamp(0)), coalesce(last_order, to_timestamp(0))),
        'last_sign_in_at', last_sign_in_at, 'last_order', last_order, 'created_at', created_at
      ) AS row
    FROM agg
    ORDER BY last_active DESC NULLS LAST
    LIMIT _limit OFFSET _offset
  ) t;

  RETURN jsonb_build_object('kpis', _kpis, 'rows', _rows, 'total', _total);
END;
$$;

REVOKE ALL ON FUNCTION public.svc_customer_center(uuid, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_customer_center(uuid, text, int, int) TO service_role;

-- ============================================================
-- Customer profile: full 360 dossier for a single customer
-- ============================================================
CREATE OR REPLACE FUNCTION public.svc_customer_profile(
  _actor uuid,
  _customer uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_staff boolean;
  _result jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _actor AND role IN ('admin','super_admin','manager')
  ) INTO _is_staff;
  IF NOT _is_staff THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id', pr.id, 'full_name', pr.full_name, 'avatar_url', pr.avatar_url,
        'phone', pr.phone, 'alt_phone', pr.alt_phone, 'country', pr.country,
        'created_at', pr.created_at, 'email', au.email,
        'last_sign_in_at', au.last_sign_in_at, 'email_confirmed_at', au.email_confirmed_at
      )
      FROM profiles pr LEFT JOIN auth.users au ON au.id = pr.id
      WHERE pr.id = _customer
    ),
    'value', (
      SELECT jsonb_build_object(
        'lifetime_revenue', (SELECT coalesce(sum(amount),0) FROM payments WHERE user_id = _customer AND status='succeeded'),
        'total_orders', (SELECT count(*) FROM orders WHERE user_id = _customer),
        'delivered_orders', (SELECT count(*) FROM orders WHERE user_id = _customer AND status IN ('delivered','fulfilled')),
        'refund_count', (SELECT count(*) FROM refunds r JOIN orders o ON o.id=r.order_id WHERE o.user_id=_customer),
        'return_count', (SELECT count(*) FROM returns WHERE user_id = _customer),
        'succeeded_payments', (SELECT count(*) FROM payments WHERE user_id=_customer AND status='succeeded'),
        'failed_payments', (SELECT count(*) FROM payments WHERE user_id=_customer AND status='failed')
      )
    ),
    'orders', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'status', status, 'payment_status', payment_status, 'fulfillment_status', fulfillment_status,
        'total', total, 'currency', currency, 'created_at', created_at,
        'tracking_number', tracking_number, 'razorpay_payment_id', razorpay_payment_id
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM orders WHERE user_id=_customer ORDER BY created_at DESC LIMIT 100) o
    ),
    'payments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'order_id', order_id, 'method', method, 'status', status, 'amount', amount,
        'currency', currency, 'transaction_id', transaction_id, 'razorpay_payment_id', razorpay_payment_id,
        'fee', fee, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM payments WHERE user_id=_customer ORDER BY created_at DESC LIMIT 100) p
    ),
    'addresses', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'full_name', full_name, 'phone', phone, 'line1', line1, 'line2', line2,
        'city', city, 'state', state, 'postal', postal, 'country', country,
        'is_default_shipping', is_default_shipping, 'is_default_billing', is_default_billing,
        'latitude', latitude, 'longitude', longitude
      ) ORDER BY is_default_shipping DESC, created_at DESC), '[]'::jsonb)
      FROM addresses WHERE user_id=_customer
    ),
    'shipments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'order_id', order_id, 'carrier', carrier, 'tracking_number', tracking_number,
        'tracking_url', tracking_url, 'status', status, 'shipped_at', shipped_at,
        'delivered_at', delivered_at, 'estimated_delivery', estimated_delivery, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM shipments WHERE user_id=_customer ORDER BY created_at DESC LIMIT 100) s
    ),
    'refunds', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'order_id', r.order_id, 'amount', r.amount, 'currency', r.currency,
        'reason', r.reason, 'status', r.status, 'razorpay_refund_id', r.razorpay_refund_id, 'created_at', r.created_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM refunds r JOIN orders o ON o.id=r.order_id WHERE o.user_id=_customer
    ),
    'returns', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'order_id', order_id, 'status', status, 'reason', reason, 'notes', notes,
        'refund_amount', refund_amount, 'refund_status', refund_status, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM returns WHERE user_id=_customer
    ),
    'tickets', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'subject', subject, 'category', category, 'status', status, 'priority', priority,
        'order_id', order_id, 'last_message_at', last_message_at, 'resolved_at', resolved_at, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM support_tickets WHERE user_id=_customer
    ),
    'notifications', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'type', type, 'title', title, 'body', body, 'link', link,
        'priority', priority, 'read_at', read_at, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM notifications WHERE user_id=_customer ORDER BY created_at DESC LIMIT 60) n
    ),
    'fraud', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'fraud_type', fraud_type, 'severity', severity, 'score', score,
        'status', status, 'detail', detail, 'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM fraud_alerts WHERE subject_id = _customer::text
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.svc_customer_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_customer_profile(uuid, uuid) TO service_role;