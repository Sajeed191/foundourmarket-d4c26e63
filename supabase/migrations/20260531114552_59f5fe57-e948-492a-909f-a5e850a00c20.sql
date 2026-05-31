-- ============================================================
-- PHASE 9 — Executive Business Intelligence Center
-- Single staff-gated aggregation RPC + supporting indexes.
-- All metrics derived live from real tables. No mock data.
-- ============================================================

-- Performance indexes for time-window & grouping aggregations
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_paystatus ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_slug ON public.order_items (product_slug);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON public.payments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments (method);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments (status);
CREATE INDEX IF NOT EXISTS idx_shipments_carrier ON public.shipments (carrier);
CREATE INDEX IF NOT EXISTS idx_returns_status ON public.returns (status);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds (status);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets (status);

CREATE OR REPLACE FUNCTION public.svc_executive_analytics(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_staff boolean;
  result jsonb;
  d_today timestamptz := date_trunc('day', now());
  d_week  timestamptz := now() - interval '7 days';
  d_month timestamptz := now() - interval '30 days';
  d_year  timestamptz := now() - interval '365 days';
BEGIN
  -- Authorisation: only super_admin / admin / manager
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor AND role IN ('super_admin','admin','manager')
  ) INTO _is_staff;
  IF NOT _is_staff THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH succ AS (
    SELECT o.* FROM orders o WHERE o.payment_status = 'succeeded'
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(total) FILTER (WHERE created_at >= d_today),0) AS rev_today,
      COALESCE(SUM(total) FILTER (WHERE created_at >= d_week),0)  AS rev_week,
      COALESCE(SUM(total) FILTER (WHERE created_at >= d_month),0) AS rev_month,
      COALESCE(SUM(total) FILTER (WHERE created_at >= d_year),0)  AS rev_year,
      COALESCE(SUM(total),0) AS rev_all,
      COUNT(*) FILTER (WHERE created_at >= d_today) AS ord_today,
      COUNT(*) FILTER (WHERE created_at >= d_week)  AS ord_week,
      COUNT(*) FILTER (WHERE created_at >= d_month) AS ord_month,
      COUNT(*) AS ord_all,
      COUNT(DISTINCT user_id) AS active_customers
    FROM succ
  ),
  cost_cte AS (
    SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, p.cost_price_inr, 0)),0) AS total_cost,
           COALESCE(SUM(oi.line_total),0) AS items_rev
    FROM order_items oi
    JOIN succ o ON o.id = oi.order_id
    LEFT JOIN products p ON p.slug = oi.product_slug
  ),
  refunds_cte AS (
    SELECT COALESCE(SUM(amount),0) AS refund_value, COUNT(*) AS refund_count FROM refunds
  ),
  returns_cte AS ( SELECT COUNT(*) AS return_count FROM returns ),
  totals AS ( SELECT COUNT(*) AS all_orders FROM orders ),
  cust AS (
    SELECT user_id, COUNT(*) AS n, MIN(created_at) AS first_order
    FROM succ GROUP BY user_id
  ),
  rev_country AS (
    SELECT COALESCE(shipping_address->>'country','Unknown') AS k, SUM(total) AS v, COUNT(*) AS n
    FROM succ GROUP BY 1 ORDER BY v DESC NULLS LAST LIMIT 10
  ),
  rev_method AS (
    SELECT COALESCE(method,'unknown') AS k, SUM(amount) AS v, COUNT(*) AS n
    FROM payments WHERE status='succeeded' GROUP BY 1 ORDER BY v DESC NULLS LAST LIMIT 10
  ),
  rev_courier AS (
    SELECT COALESCE(carrier,'unassigned') AS k, COUNT(*) AS n,
      COUNT(*) FILTER (WHERE status='delivered') AS delivered,
      COUNT(*) FILTER (WHERE status IN ('returned','rto')) AS returned
    FROM shipments GROUP BY 1 ORDER BY n DESC LIMIT 10
  ),
  prod_sales AS (
    SELECT oi.product_slug AS slug, MAX(oi.name) AS name,
      SUM(oi.quantity) AS units, SUM(oi.line_total) AS revenue
    FROM order_items oi JOIN succ o ON o.id = oi.order_id
    GROUP BY oi.product_slug
  ),
  rev_category AS (
    SELECT COALESCE(p.category,'Uncategorised') AS k, SUM(ps.revenue) AS v, SUM(ps.units) AS units
    FROM prod_sales ps LEFT JOIN products p ON p.slug = ps.slug
    GROUP BY 1 ORDER BY v DESC NULLS LAST LIMIT 10
  ),
  rev_brand AS (
    SELECT COALESCE(p.brand,'Unbranded') AS k, SUM(ps.revenue) AS v
    FROM prod_sales ps LEFT JOIN products p ON p.slug = ps.slug
    GROUP BY 1 ORDER BY v DESC NULLS LAST LIMIT 10
  ),
  top_customers AS (
    SELECT c.user_id, pr.full_name, SUM(o.total) AS spend, COUNT(*) AS orders
    FROM succ o JOIN cust c ON c.user_id = o.user_id
    LEFT JOIN profiles pr ON pr.id = o.user_id
    GROUP BY c.user_id, pr.full_name ORDER BY spend DESC NULLS LAST LIMIT 10
  ),
  inventory AS (
    SELECT
      COUNT(*) FILTER (WHERE stock_quantity <= COALESCE(low_stock_threshold,5) AND stock_quantity > 0) AS low_stock,
      COUNT(*) FILTER (WHERE stock_quantity = 0 OR in_stock = false) AS out_of_stock,
      COUNT(*) FILTER (WHERE COALESCE(sold_count,0) = 0 AND created_at < now() - interval '60 days') AS dead_stock,
      COUNT(*) AS total_products
    FROM products WHERE deleted_at IS NULL
  ),
  most_viewed AS (
    SELECT slug, name, COALESCE(views_count,0) AS views, COALESCE(sold_count,0) AS sold
    FROM products WHERE deleted_at IS NULL ORDER BY views_count DESC NULLS LAST LIMIT 8
  ),
  most_wishlisted AS (
    SELECT slug, name, COALESCE(wishlist_count,0) AS wishlist
    FROM products WHERE deleted_at IS NULL ORDER BY wishlist_count DESC NULLS LAST LIMIT 8
  ),
  order_an AS (
    SELECT
      COUNT(*) FILTER (WHERE payment_status='succeeded') AS successful,
      COUNT(*) FILTER (WHERE status='payment_failed' OR payment_status='failed') AS failed,
      COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE payment_method='cod') AS cod,
      COUNT(*) FILTER (WHERE payment_method <> 'cod' AND payment_status='succeeded') AS prepaid,
      COUNT(*) FILTER (WHERE fulfillment_status='delivered' OR status='delivered') AS delivered,
      COUNT(*) FILTER (WHERE status='returned') AS returned,
      COUNT(*) FILTER (WHERE status='refunded') AS refunded
    FROM orders
  ),
  pay_an AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status='succeeded') AS succeeded,
      COUNT(*) FILTER (WHERE status='failed') AS failed,
      COUNT(*) FILTER (WHERE status='pending') AS pending
    FROM payments
  ),
  ship_an AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status='delivered') AS delivered,
      COUNT(*) FILTER (WHERE status IN ('returned','rto')) AS returned,
      AVG(EXTRACT(EPOCH FROM (delivered_at - shipped_at))/86400.0) FILTER (WHERE delivered_at IS NOT NULL AND shipped_at IS NOT NULL) AS avg_delivery_days
    FROM shipments
  ),
  support_an AS (
    SELECT
      COUNT(*) FILTER (WHERE status='open') AS open,
      COUNT(*) FILTER (WHERE status='pending') AS pending,
      COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved,
      COUNT(*) FILTER (WHERE status='escalated') AS escalated,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600.0) FILTER (WHERE resolved_at IS NOT NULL) AS avg_resolution_hours
    FROM support_tickets
  ),
  marketing_an AS (
    SELECT COALESCE(SUM(spend),0) AS spend, COUNT(*) AS campaigns,
      COUNT(*) FILTER (WHERE status='active') AS active_campaigns
    FROM marketing_campaigns
  ),
  fraud_an AS (
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status <> 'resolved') AS open_alerts
    FROM fraud_alerts
  ),
  daily AS (
    SELECT to_char(date_trunc('day', gs), 'YYYY-MM-DD') AS date,
      COALESCE((SELECT SUM(total) FROM succ s WHERE date_trunc('day', s.created_at) = gs),0) AS revenue,
      COALESCE((SELECT COUNT(*) FROM succ s WHERE date_trunc('day', s.created_at) = gs),0) AS orders
    FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') gs
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT to_jsonb(k) FROM kpis k),
    'profit', (SELECT jsonb_build_object(
        'gross_profit', (SELECT items_rev - total_cost FROM cost_cte),
        'total_cost', (SELECT total_cost FROM cost_cte),
        'net_profit', (SELECT items_rev - total_cost - (SELECT refund_value FROM refunds_cte) FROM cost_cte),
        'aov', (SELECT CASE WHEN ord_all>0 THEN rev_all/ord_all ELSE 0 END FROM kpis),
        'refund_value', (SELECT refund_value FROM refunds_cte),
        'refund_rate', (SELECT CASE WHEN all_orders>0 THEN (SELECT refund_count FROM refunds_cte)::numeric/all_orders*100 ELSE 0 END FROM totals),
        'return_rate', (SELECT CASE WHEN all_orders>0 THEN (SELECT return_count FROM returns_cte)::numeric/all_orders*100 ELSE 0 END FROM totals),
        'repeat_rate', (SELECT CASE WHEN (SELECT COUNT(*) FROM cust)>0 THEN (SELECT COUNT(*) FROM cust WHERE n>1)::numeric/(SELECT COUNT(*) FROM cust)*100 ELSE 0 END),
        'new_customers', (SELECT COUNT(*) FROM cust WHERE first_order >= d_month),
        'repeat_customers', (SELECT COUNT(*) FROM cust WHERE n>1)
      )),
    'revenue_by_country', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM rev_country r),
    'revenue_by_method', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM rev_method r),
    'revenue_by_category', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM rev_category r),
    'revenue_by_brand', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM rev_brand r),
    'revenue_by_courier', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM rev_courier r),
    'top_products', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT * FROM prod_sales ORDER BY revenue DESC NULLS LAST LIMIT 10) r),
    'worst_products', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT slug,name,COALESCE(sold_count,0) AS sold,COALESCE(views_count,0) AS views FROM products WHERE deleted_at IS NULL ORDER BY sold_count ASC NULLS FIRST LIMIT 8) r),
    'most_viewed', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM most_viewed r),
    'most_wishlisted', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM most_wishlisted r),
    'top_customers', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM top_customers r),
    'inventory', (SELECT to_jsonb(i) FROM inventory i),
    'order_analytics', (SELECT to_jsonb(o) FROM order_an o),
    'payment_analytics', (SELECT to_jsonb(p) FROM pay_an p),
    'shipping_analytics', (SELECT to_jsonb(s) FROM ship_an s),
    'support_analytics', (SELECT to_jsonb(s) FROM support_an s),
    'marketing_analytics', (SELECT to_jsonb(m) FROM marketing_an m),
    'fraud_analytics', (SELECT to_jsonb(f) FROM fraud_an f),
    'daily', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.date),'[]') FROM daily d),
    'generated_at', to_jsonb(now())
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.svc_executive_analytics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.svc_executive_analytics(uuid) TO service_role;