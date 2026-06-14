-- =====================================================================
-- Customer Intelligence: real revenue from paid orders + status system
-- =====================================================================

-- 1. Account status + soft-delete + control flags on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ordering_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviews_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- constrain to the four supported statuses via a trigger-free check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_chk
      CHECK (account_status IN ('active','suspended','banned','deleted'));
  END IF;
END $$;

-- 2. Recreate the customer center RPC: revenue from PAID ORDERS (payments table is empty)
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
    'paying_customers', (SELECT count(DISTINCT user_id) FROM orders WHERE payment_status = 'paid'),
    'total_revenue', (SELECT coalesce(sum(total),0) FROM orders WHERE payment_status = 'paid'),
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
    SELECT pr.id, pr.full_name, pr.phone, pr.country, pr.created_at,
           pr.account_status, pr.ordering_blocked, pr.reviews_disabled, pr.deleted_at,
           au.email, au.last_sign_in_at
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
      (SELECT coalesce(sum(o.total),0) FROM orders o WHERE o.user_id = b.id AND o.payment_status = 'paid') AS lifetime_spend,
      (SELECT count(*) FROM orders o WHERE o.user_id = b.id AND o.payment_status = 'paid') AS successful_payments,
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
        'account_status', account_status, 'ordering_blocked', ordering_blocked,
        'reviews_disabled', reviews_disabled, 'deleted_at', deleted_at,
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

-- 3. Patch the profile RPC: lifetime_revenue + succeeded_payments from paid orders
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
        'account_status', pr.account_status, 'ordering_blocked', pr.ordering_blocked,
        'reviews_disabled', pr.reviews_disabled, 'deleted_at', pr.deleted_at,
        'last_sign_in_at', au.last_sign_in_at, 'email_confirmed_at', au.email_confirmed_at
      )
      FROM profiles pr LEFT JOIN auth.users au ON au.id = pr.id
      WHERE pr.id = _customer
    ),
    'value', (
      SELECT jsonb_build_object(
        'lifetime_revenue', (SELECT coalesce(sum(total),0) FROM orders WHERE user_id = _customer AND payment_status='paid'),
        'total_orders', (SELECT count(*) FROM orders WHERE user_id = _customer),
        'delivered_orders', (SELECT count(*) FROM orders WHERE user_id = _customer AND status IN ('delivered','fulfilled')),
        'refund_count', (SELECT count(*) FROM refunds r JOIN orders o ON o.id=r.order_id WHERE o.user_id=_customer),
        'return_count', (SELECT count(*) FROM returns WHERE user_id = _customer),
        'succeeded_payments', (SELECT count(*) FROM orders WHERE user_id=_customer AND payment_status='paid'),
        'failed_payments', (SELECT count(*) FROM orders WHERE user_id=_customer AND payment_status='failed')
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