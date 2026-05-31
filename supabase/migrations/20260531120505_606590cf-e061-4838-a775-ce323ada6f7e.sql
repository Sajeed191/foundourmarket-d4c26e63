-- Performance indexes for marketing aggregation
CREATE INDEX IF NOT EXISTS idx_orders_user_payment ON public.orders(user_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_promo_code ON public.orders(promo_code) WHERE promo_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_status ON public.orders(created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_carts_updated ON public.carts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishlist_slug ON public.wishlist(product_slug);
CREATE INDEX IF NOT EXISTS idx_notifications_type_created ON public.notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_slug_created ON public.order_items(product_slug, created_at DESC);

CREATE OR REPLACE FUNCTION public.svc_marketing_intelligence(_actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_vip numeric;
  v_avg_spend numeric;
BEGIN
  -- Per-customer paid order stats (success = paid/succeeded)
  CREATE TEMP TABLE _cust ON COMMIT DROP AS
  SELECT
    o.user_id,
    count(*) FILTER (WHERE o.payment_status IN ('paid','succeeded') OR o.status = 'paid') AS paid_orders,
    coalesce(sum(o.total) FILTER (WHERE o.payment_status IN ('paid','succeeded') OR o.status = 'paid'), 0) AS spend,
    max(o.created_at) FILTER (WHERE o.payment_status IN ('paid','succeeded') OR o.status = 'paid') AS last_order,
    min(o.created_at) FILTER (WHERE o.payment_status IN ('paid','succeeded') OR o.status = 'paid') AS first_order
  FROM public.orders o
  GROUP BY o.user_id;

  SELECT coalesce(percentile_cont(0.9) WITHIN GROUP (ORDER BY spend), 0), coalesce(avg(spend),0)
    INTO v_vip, v_avg_spend
  FROM _cust WHERE paid_orders > 0;
  IF v_vip <= 0 THEN v_vip := greatest(v_avg_spend * 2, 1); END IF;

  -- Abandoned carts (with item value, not converted after last update)
  CREATE TEMP TABLE _carts ON COMMIT DROP AS
  SELECT
    c.id, c.user_id, c.updated_at, c.abandoned_cart_sent_at,
    coalesce(sum(ci.quantity * coalesce(p.price_usd, p.price, 0)), 0) AS value,
    count(ci.id) AS item_count
  FROM public.carts c
  JOIN public.cart_items ci ON ci.cart_id = c.id AND ci.saved_for_later = false
  LEFT JOIN public.products p ON p.slug = ci.product_slug
  GROUP BY c.id, c.user_id, c.updated_at, c.abandoned_cart_sent_at;

  result := jsonb_build_object(
    'segments', (
      SELECT jsonb_build_object(
        'total_customers', (SELECT count(*) FROM _cust),
        'buyers', (SELECT count(*) FROM _cust WHERE paid_orders > 0),
        'new', (SELECT count(*) FROM _cust WHERE paid_orders = 1),
        'returning', (SELECT count(*) FROM _cust WHERE paid_orders >= 2),
        'frequent', (SELECT count(*) FROM _cust WHERE paid_orders >= 4),
        'vip', (SELECT count(*) FROM _cust WHERE paid_orders > 0 AND spend >= v_vip),
        'high_ltv', (SELECT count(*) FROM _cust WHERE paid_orders >= 3 AND spend >= v_avg_spend),
        'dormant', (SELECT count(*) FROM _cust WHERE paid_orders > 0 AND last_order < now() - interval '90 days'),
        'abandoned_cart', (SELECT count(DISTINCT c.user_id) FROM _carts c
            WHERE c.updated_at < now() - interval '30 minutes'
              AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = c.user_id
                AND (o.payment_status IN ('paid','succeeded') OR o.status='paid') AND o.created_at > c.updated_at)),
        'refund_risk', (SELECT count(DISTINCT o.user_id) FROM public.refunds r JOIN public.orders o ON o.id = r.order_id),
        'high_return', (SELECT count(*) FROM (SELECT user_id FROM public.returns GROUP BY user_id HAVING count(*) >= 2) t),
        'newsletter', (SELECT count(*) FROM public.newsletter_subscribers WHERE status = 'subscribed'),
        'vip_threshold', round(v_vip, 2),
        'avg_ltv', round(v_avg_spend, 2)
      )
    ),
    'segments_by_country', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT coalesce(p.country, p.market_region, o.market_region, 'Unknown') AS k,
               count(DISTINCT o.user_id) AS customers,
               round(coalesce(sum(o.total) FILTER (WHERE o.payment_status IN ('paid','succeeded') OR o.status='paid'),0),2) AS revenue
        FROM public.orders o LEFT JOIN public.profiles p ON p.id = o.user_id
        GROUP BY 1 ORDER BY revenue DESC NULLS LAST LIMIT 15
      ) t
    ),
    'segments_by_city', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT coalesce(o.shipping_address->>'city', 'Unknown') AS k, count(*) AS orders
        FROM public.orders o
        WHERE (o.payment_status IN ('paid','succeeded') OR o.status='paid')
        GROUP BY 1 ORDER BY orders DESC LIMIT 15
      ) t
    ),
    'abandoned', (
      SELECT jsonb_build_object(
        'bucket_30m', (SELECT count(*) FROM _carts WHERE updated_at <= now() - interval '30 minutes' AND updated_at > now() - interval '24 hours'),
        'bucket_24h', (SELECT count(*) FROM _carts WHERE updated_at <= now() - interval '24 hours' AND updated_at > now() - interval '3 days'),
        'bucket_3d', (SELECT count(*) FROM _carts WHERE updated_at <= now() - interval '3 days'),
        'total_carts', (SELECT count(*) FROM _carts),
        'value_at_risk', (SELECT round(coalesce(sum(value),0),2) FROM _carts WHERE updated_at < now() - interval '30 minutes'),
        'recovery_sent', (SELECT count(*) FROM _carts WHERE abandoned_cart_sent_at IS NOT NULL),
        'recovered_orders', (SELECT count(*) FROM _carts c WHERE c.abandoned_cart_sent_at IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = c.user_id
              AND (o.payment_status IN ('paid','succeeded') OR o.status='paid') AND o.created_at > c.abandoned_cart_sent_at)),
        'recovered_revenue', (SELECT round(coalesce(sum(o.total),0),2) FROM _carts c
            JOIN LATERAL (SELECT total FROM public.orders o WHERE o.user_id = c.user_id
              AND (o.payment_status IN ('paid','succeeded') OR o.status='paid') AND o.created_at > c.abandoned_cart_sent_at
              ORDER BY o.created_at LIMIT 1) o ON true
            WHERE c.abandoned_cart_sent_at IS NOT NULL)
      )
    ),
    'top_carts', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT c.user_id, coalesce(p.full_name,'Customer') AS name, c.value, c.item_count,
               extract(epoch FROM (now() - c.updated_at))/3600 AS hours_idle
        FROM _carts c LEFT JOIN public.profiles p ON p.id = c.user_id
        WHERE c.updated_at < now() - interval '30 minutes' AND c.value > 0
        ORDER BY c.value DESC LIMIT 20
      ) t
    ),
    'coupons', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT pc.code, pc.kind, pc.value, pc.active, pc.uses, pc.max_uses, pc.expires_at,
               (pc.expires_at IS NOT NULL AND pc.expires_at < now()) AS expired,
               coalesce(u.order_count,0) AS order_count,
               round(coalesce(u.revenue,0),2) AS revenue,
               round(coalesce(u.discount,0),2) AS discount_given
        FROM public.promo_codes pc
        LEFT JOIN (
          SELECT lower(promo_code) AS code, count(*) AS order_count,
                 sum(total) AS revenue, sum(discount) AS discount
          FROM public.orders
          WHERE promo_code IS NOT NULL AND (payment_status IN ('paid','succeeded') OR status='paid')
          GROUP BY lower(promo_code)
        ) u ON u.code = lower(pc.code)
        ORDER BY revenue DESC NULLS LAST
      ) t
    ),
    'products', (
      SELECT jsonb_build_object(
        'most_viewed', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT slug, name, views_count FROM public.products WHERE status='published' ORDER BY views_count DESC NULLS LAST LIMIT 10) t),
        'most_wishlisted', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT w.product_slug AS slug, coalesce(p.name, w.product_slug) AS name, count(*) AS wishes
          FROM public.wishlist w LEFT JOIN public.products p ON p.slug = w.product_slug
          GROUP BY 1,2 ORDER BY wishes DESC LIMIT 10) t),
        'trending', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT oi.product_slug AS slug, max(oi.name) AS name, sum(oi.quantity) AS units, round(sum(oi.line_total),2) AS revenue
          FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
          WHERE o.created_at > now() - interval '14 days' AND (o.payment_status IN ('paid','succeeded') OR o.status='paid')
          GROUP BY 1 ORDER BY units DESC LIMIT 10) t),
        'dead', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT p.slug, p.name, p.views_count, p.stock_quantity
          FROM public.products p
          WHERE p.status='published' AND p.in_stock
            AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.product_slug = p.slug)
          ORDER BY p.views_count ASC LIMIT 10) t),
        'needs_promotion', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT p.slug, p.name, p.views_count, p.stock_quantity,
                 coalesce(s.units,0) AS units_sold
          FROM public.products p
          LEFT JOIN (SELECT product_slug, sum(quantity) units FROM public.order_items GROUP BY 1) s ON s.product_slug = p.slug
          WHERE p.status='published' AND p.in_stock AND p.stock_quantity > 0 AND p.views_count > 0 AND coalesce(s.units,0) = 0
          ORDER BY p.views_count DESC LIMIT 10) t)
      )
    ),
    'campaigns', (
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM public.marketing_campaigns),
        'active', (SELECT count(*) FROM public.marketing_campaigns WHERE status IN ('active','running','live')),
        'scheduled', (SELECT count(*) FROM public.marketing_campaigns WHERE status='scheduled'),
        'draft', (SELECT count(*) FROM public.marketing_campaigns WHERE status='draft'),
        'spend', (SELECT round(coalesce(sum(spend),0),2) FROM public.marketing_campaigns),
        'audience', (SELECT coalesce(sum(audience_size),0) FROM public.marketing_campaigns),
        'list', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT id, name, campaign_type, status, audience_size, spend, scheduled_at, launched_at
          FROM public.marketing_campaigns ORDER BY created_at DESC LIMIT 25) t)
      )
    ),
    'automations', (
      SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM public.marketing_automations),
        'enabled', (SELECT count(*) FROM public.marketing_automations WHERE enabled),
        'list', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT a.id, a.name, a.automation_type, a.trigger_key, a.channel, a.enabled, a.status, a.last_run_at,
                 (SELECT count(*) FROM public.automation_executions e WHERE e.automation_id = a.id) AS runs
          FROM public.marketing_automations a ORDER BY a.priority DESC, a.created_at DESC LIMIT 25) t)
      )
    ),
    'engagement', (
      SELECT jsonb_build_object(
        'opens', (SELECT count(*) FROM public.campaign_events WHERE event_type='open'),
        'clicks', (SELECT count(*) FROM public.campaign_events WHERE event_type='click'),
        'notifications_30d', (SELECT count(*) FROM public.notifications WHERE created_at > now() - interval '30 days'),
        'notifications_read', (SELECT count(*) FROM public.notifications WHERE created_at > now() - interval '30 days' AND read_at IS NOT NULL),
        'by_type', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
          SELECT type AS k, count(*) AS n, count(*) FILTER (WHERE read_at IS NOT NULL) AS read
          FROM public.notifications WHERE created_at > now() - interval '90 days'
          GROUP BY type ORDER BY n DESC LIMIT 15) t)
      )
    ),
    'generated_at', now()
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.svc_marketing_intelligence(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_marketing_intelligence(uuid) TO service_role;