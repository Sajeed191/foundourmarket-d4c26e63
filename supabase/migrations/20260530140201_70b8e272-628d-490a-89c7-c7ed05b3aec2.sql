CREATE OR REPLACE FUNCTION public.admin_order_operations(_limit integer DEFAULT 400)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  paid_pred text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH base AS (
    SELECT o.* FROM public.orders o
    WHERE coalesce(o.is_seeded,false) = false
  ),
  oi_agg AS (
    SELECT oi.order_id,
      count(*) AS line_count,
      coalesce(sum(oi.quantity),0) AS units,
      coalesce(sum(oi.line_total),0) AS items_total,
      coalesce(sum(
        oi.line_total - (coalesce(
          CASE WHEN bo.currency = 'INR' THEN p.cost_price_inr
               ELSE p.cost_price_usd END,
          p.cost, 0) * oi.quantity)
      ),0) AS profit,
      jsonb_agg(jsonb_build_object(
        'name', oi.name, 'product_slug', oi.product_slug, 'image', oi.image,
        'quantity', oi.quantity, 'unit_price', oi.unit_price, 'line_total', oi.line_total
      ) ORDER BY oi.line_total DESC) AS items
    FROM public.order_items oi
    JOIN base bo ON bo.id = oi.order_id
    LEFT JOIN public.products p ON p.slug = oi.product_slug
    GROUP BY oi.order_id, bo.currency
  ),
  ship AS (
    SELECT DISTINCT ON (order_id) order_id, carrier, status AS ship_status,
      shipped_at, delivered_at
    FROM public.shipments ORDER BY order_id, updated_at DESC NULLS LAST
  ),
  ret AS (
    SELECT DISTINCT ON (order_id) order_id, status AS return_status, reason AS return_reason,
      refund_amount AS return_refund, refund_status AS return_refund_status
    FROM public.returns ORDER BY order_id, created_at DESC
  ),
  ref AS (
    SELECT order_id, coalesce(sum(amount),0) AS refund_amount,
      max(reason) AS refund_reason,
      bool_or(lower(status) IN ('processed','succeeded','completed','paid')) AS refunded
    FROM public.refunds GROUP BY order_id
  ),
  tix AS (
    SELECT order_id,
      count(*) AS tickets,
      count(*) FILTER (WHERE status NOT IN ('resolved','closed')) AS open_tickets
    FROM public.support_tickets WHERE order_id IS NOT NULL GROUP BY order_id
  ),
  uord AS (
    SELECT user_id, count(*) AS lifetime_orders, coalesce(sum(total),0) AS lifetime_value
    FROM base WHERE user_id IS NOT NULL GROUP BY user_id
  ),
  enriched AS (
    SELECT b.*,
      coalesce(oi.units,0) AS units,
      coalesce(oi.line_count,0) AS line_count,
      coalesce(oi.profit,0) AS profit,
      coalesce(oi.items,'[]'::jsonb) AS items,
      s.carrier AS ship_carrier, s.ship_status, s.shipped_at, s.delivered_at,
      r.return_status, r.return_reason,
      rf.refund_amount, rf.refunded, rf.refund_reason,
      coalesce(t.tickets,0) AS tickets, coalesce(t.open_tickets,0) AS open_tickets,
      coalesce(uo.lifetime_orders,0) AS lifetime_orders,
      coalesce(uo.lifetime_value,0) AS lifetime_value,
      p.full_name, p.avatar_url, p.country
    FROM base b
    LEFT JOIN oi_agg oi ON oi.order_id = b.id
    LEFT JOIN ship s ON s.order_id = b.id
    LEFT JOIN ret r ON r.order_id = b.id
    LEFT JOIN ref rf ON rf.order_id = b.id
    LEFT JOIN tix t ON t.order_id = b.id
    LEFT JOIN uord uo ON uo.user_id = b.user_id
    LEFT JOIN public.profiles p ON p.id = b.user_id
  ),
  recent AS (
    SELECT * FROM enriched ORDER BY created_at DESC LIMIT LEAST(coalesce(_limit,400), 1000)
  ),
  kpis AS (
    SELECT
      count(*) AS total_orders,
      count(*) FILTER (WHERE created_at::date = now()::date) AS today_orders,
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE status = 'processing') AS processing,
      count(*) FILTER (WHERE status = 'shipped' OR fulfillment_status = 'shipped') AS shipped,
      count(*) FILTER (WHERE status = 'delivered' OR fulfillment_status = 'delivered') AS delivered,
      count(*) FILTER (WHERE status IN ('cancelled','canceled')) AS cancelled,
      count(*) FILTER (WHERE return_status IS NOT NULL) AS returned,
      count(*) FILTER (WHERE refunded) AS refunded,
      count(*) FILTER (WHERE payment_method ILIKE '%cod%' OR payment_method ILIKE '%cash%') AS cod_orders,
      count(*) FILTER (WHERE payment_status = 'paid') AS paid_orders,
      count(*) FILTER (WHERE payment_status = 'failed') AS failed_payments,
      coalesce(sum(total) FILTER (WHERE payment_status='paid' OR status IN ('paid','fulfilled','delivered','shipped','processing','completed')),0) AS revenue,
      coalesce(sum(profit) FILTER (WHERE payment_status='paid' OR status IN ('paid','fulfilled','delivered','shipped','processing','completed')),0) AS profit,
      coalesce(sum(coalesce(refund_amount,0)),0) AS refund_total
    FROM enriched
  ),
  courier AS (
    SELECT coalesce(ship_carrier, carrier, 'Unassigned') AS courier,
      count(*) AS shipments,
      count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
      count(*) FILTER (WHERE return_status IS NOT NULL) AS returns,
      avg(EXTRACT(EPOCH FROM (delivered_at - shipped_at))/86400.0)
        FILTER (WHERE delivered_at IS NOT NULL AND shipped_at IS NOT NULL) AS avg_days
    FROM enriched WHERE ship_carrier IS NOT NULL OR carrier IS NOT NULL
    GROUP BY 1 ORDER BY shipments DESC LIMIT 12
  ),
  region AS (
    SELECT coalesce(market_region, country, 'Unknown') AS region,
      count(*) AS orders,
      coalesce(sum(total) FILTER (WHERE payment_status='paid'),0) AS revenue,
      count(*) FILTER (WHERE return_status IS NOT NULL) AS returns,
      count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered
    FROM enriched GROUP BY 1 ORDER BY orders DESC LIMIT 12
  ),
  return_reasons AS (
    SELECT coalesce(return_reason,'Unspecified') AS reason, count(*) AS cnt
    FROM enriched WHERE return_status IS NOT NULL GROUP BY 1 ORDER BY cnt DESC LIMIT 10
  ),
  top_returned AS (
    SELECT it->>'product_slug' AS slug, max(it->>'name') AS name, count(*) AS cnt
    FROM enriched e, jsonb_array_elements(e.items) it
    WHERE e.return_status IS NOT NULL
    GROUP BY 1 ORDER BY cnt DESC LIMIT 10
  ),
  staff AS (
    SELECT st.assigned_to AS uid, pr.full_name, pr.avatar_url,
      count(*) AS tickets_handled,
      count(*) FILTER (WHERE st.status IN ('resolved','closed')) AS tickets_resolved,
      avg(EXTRACT(EPOCH FROM (st.resolved_at - st.created_at))/3600.0)
        FILTER (WHERE st.resolved_at IS NOT NULL) AS avg_handling_hours
    FROM public.support_tickets st
    LEFT JOIN public.profiles pr ON pr.id = st.assigned_to
    WHERE st.assigned_to IS NOT NULL
    GROUP BY 1,2,3 ORDER BY tickets_handled DESC LIMIT 20
  ),
  staff_acts AS (
    SELECT al.actor_id AS uid, pr.full_name, pr.avatar_url, count(*) AS actions,
      max(al.created_at) AS last_action
    FROM public.admin_activity_logs al
    LEFT JOIN public.profiles pr ON pr.id = al.actor_id
    WHERE al.actor_id IS NOT NULL
    GROUP BY 1,2,3 ORDER BY actions DESC LIMIT 20
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'kpis', (SELECT to_jsonb(kpis) FROM kpis),
    'aov', (SELECT CASE WHEN paid_orders>0 THEN round(revenue/paid_orders,2) ELSE 0 END FROM kpis),
    'orders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'created_at', created_at, 'status', status,
        'payment_status', payment_status, 'fulfillment_status', fulfillment_status,
        'payment_method', payment_method, 'payment_provider', payment_provider,
        'market_region', coalesce(market_region, country), 'currency', currency,
        'total', total, 'subtotal', subtotal, 'discount', discount, 'promo_code', promo_code,
        'tracking_number', tracking_number, 'carrier', coalesce(ship_carrier, carrier),
        'user_id', user_id, 'contact_email', contact_email,
        'full_name', full_name, 'avatar_url', avatar_url, 'country', country,
        'items', items, 'units', units, 'line_count', line_count, 'profit', profit,
        'ship_status', ship_status, 'shipped_at', shipped_at, 'delivered_at', delivered_at,
        'return_status', return_status, 'return_reason', return_reason,
        'refund_amount', refund_amount, 'refunded', refunded, 'refund_reason', refund_reason,
        'tickets', tickets, 'open_tickets', open_tickets,
        'lifetime_orders', lifetime_orders, 'lifetime_value', lifetime_value
      ) ORDER BY created_at DESC), '[]'::jsonb) FROM recent),
    'courier_performance', (SELECT coalesce(jsonb_agg(to_jsonb(courier)), '[]'::jsonb) FROM courier),
    'region_performance', (SELECT coalesce(jsonb_agg(to_jsonb(region)), '[]'::jsonb) FROM region),
    'return_reasons', (SELECT coalesce(jsonb_agg(to_jsonb(return_reasons)), '[]'::jsonb) FROM return_reasons),
    'top_returned', (SELECT coalesce(jsonb_agg(to_jsonb(top_returned)), '[]'::jsonb) FROM top_returned),
    'staff_support', (SELECT coalesce(jsonb_agg(to_jsonb(staff)), '[]'::jsonb) FROM staff),
    'staff_activity', (SELECT coalesce(jsonb_agg(to_jsonb(staff_acts)), '[]'::jsonb) FROM staff_acts)
  ) INTO result;

  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_order_operations(integer) TO authenticated;