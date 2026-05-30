-- P2-B Acquisition Intelligence: service_role-only aggregation RPC.
-- Computes CAC / ROAS / CPA / attribution-model comparison and multi-dimensional
-- breakdowns 100% from real data (campaign_events, attribution_touches,
-- order_attributions, orders, marketing_campaigns). No simulated metrics.

CREATE OR REPLACE FUNCTION public.svc_acquisition_metrics(
  p_since timestamptz,
  p_window_days int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH
  -- Attributed (paid) orders enriched with order-level geo context.
  oa AS (
    SELECT a.order_id, a.revenue, a.session_id, a.user_id,
           a.first_touch_campaign_id, a.last_touch_campaign_id,
           a.first_touch_at, a.last_touch_at, a.order_created_at, a.utm,
           coalesce(nullif(o.market_region, ''), 'unknown') AS region,
           coalesce(nullif(o.shipping_address->>'country', ''), nullif(o.market_region, ''), 'unknown') AS country
    FROM order_attributions a
    JOIN orders o ON o.id = a.order_id
    WHERE a.order_created_at >= p_since
  ),
  -- Session -> device derived from real user-agent strings.
  dev AS (
    SELECT session_id,
      max(CASE
        WHEN user_agent ILIKE '%ipad%' OR user_agent ILIKE '%tablet%' THEN 'tablet'
        WHEN user_agent ILIKE '%mobile%' OR user_agent ILIKE '%android%' OR user_agent ILIKE '%iphone%' THEN 'mobile'
        WHEN user_agent IS NULL OR user_agent = '' THEN 'unknown'
        ELSE 'desktop' END) AS device
    FROM campaign_events
    WHERE session_id IS NOT NULL AND created_at >= p_since
    GROUP BY session_id
  ),
  -- Last-touch campaign total attributed revenue, for proportional spend allocation.
  camp_rev AS (
    SELECT last_touch_campaign_id AS cid, sum(revenue) AS total
    FROM oa WHERE last_touch_campaign_id IS NOT NULL GROUP BY 1
  ),
  -- Order-level facts with last-touch dimensions + allocated real spend.
  ord AS (
    SELECT oa.*, mc.campaign_type, mc.name AS campaign_name,
      coalesce(nullif(mc.region, ''), 'unknown') AS camp_region,
      coalesce(nullif(oa.utm->>'utm_source', ''), 'direct') AS source,
      coalesce(nullif(oa.utm->>'utm_medium', ''), 'none') AS medium,
      coalesce(nullif(oa.utm->>'utm_campaign', ''), 'none') AS utm_campaign,
      coalesce(d.device, 'unknown') AS device,
      CASE WHEN cr.total > 0 THEN mc.spend * (oa.revenue / cr.total) ELSE 0 END AS alloc_spend
    FROM oa
    LEFT JOIN marketing_campaigns mc ON mc.id = oa.last_touch_campaign_id
    LEFT JOIN camp_rev cr ON cr.cid = oa.last_touch_campaign_id
    LEFT JOIN dev d ON d.session_id = oa.session_id
  ),
  -- Real visitor touches in range.
  t AS (
    SELECT session_id, user_id, campaign_id, created_at,
      coalesce(nullif(utm_source, ''), 'direct') AS source,
      coalesce(nullif(utm_medium, ''), 'none') AS medium,
      coalesce(nullif(utm_campaign, ''), 'none') AS utm_campaign
    FROM attribution_touches
    WHERE created_at >= p_since
  ),
  -- Touches expanded per attributed order for linear / time-decay models.
  tpo AS (
    SELECT ord.order_id, ord.revenue, at.campaign_id,
      count(*) OVER (PARTITION BY ord.order_id) AS n,
      power(2.0, - (extract(epoch FROM (ord.order_created_at - at.created_at)) / 86400.0) / 7.0) AS w
    FROM ord
    JOIN attribution_touches at
      ON (at.session_id = ord.session_id OR (ord.user_id IS NOT NULL AND at.user_id = ord.user_id))
     AND at.campaign_id IS NOT NULL
     AND at.created_at <= ord.order_created_at
     AND at.created_at >= ord.order_created_at - make_interval(days => p_window_days)
  ),
  tpo2 AS (
    SELECT *, sum(w) OVER (PARTITION BY order_id) AS wsum FROM tpo
  ),
  -- First-order detection for new vs returning customer rates.
  first_order AS (
    SELECT user_id, min(created_at) AS first_at FROM orders WHERE user_id IS NOT NULL GROUP BY user_id
  ),
  newret AS (
    SELECT
      count(*) FILTER (WHERE o.created_at = f.first_at) AS new_orders,
      count(*) AS total_orders
    FROM orders o JOIN first_order f ON f.user_id = o.user_id
    WHERE o.created_at >= p_since
  )
  SELECT jsonb_build_object(
    'overall', (
      SELECT jsonb_build_object(
        'revenue', coalesce(sum(revenue), 0),
        'conversions', count(*),
        'spend', coalesce(sum(alloc_spend), 0),
        'aov', CASE WHEN count(*) > 0 THEN sum(revenue) / count(*) ELSE 0 END
      ) FROM ord
    ),
    'visitors', (SELECT count(DISTINCT coalesce(user_id::text, session_id)) FROM t),
    'sessions', (SELECT count(DISTINCT session_id) FROM t),
    'opens', (SELECT count(*) FROM campaign_events WHERE event_type = 'open' AND created_at >= p_since),
    'clicks', (SELECT count(*) FROM campaign_events WHERE event_type = 'click' AND created_at >= p_since),
    'new_orders', (SELECT new_orders FROM newret),
    'total_customer_orders', (SELECT total_orders FROM newret),
    'assisted_conversions', (
      SELECT count(*) FROM ord
      WHERE first_touch_campaign_id IS NOT NULL
        AND first_touch_campaign_id IS DISTINCT FROM last_touch_campaign_id
    ),
    'by_campaign', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'key', coalesce(campaign_name, 'Unattributed'),
          'id', last_touch_campaign_id,
          'type', coalesce(campaign_type, 'unknown'),
          'revenue', sum(revenue), 'orders', count(*), 'spend', sum(alloc_spend)
        ) AS x
        FROM ord GROUP BY last_touch_campaign_id, campaign_name, campaign_type
        ORDER BY sum(revenue) DESC
      ) s
    ),
    'by_channel', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', coalesce(campaign_type, 'unknown'),
          'revenue', sum(revenue), 'orders', count(*), 'spend', sum(alloc_spend)) AS x
        FROM ord GROUP BY campaign_type ORDER BY sum(revenue) DESC
      ) s
    ),
    'by_source', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', o.source, 'revenue', o.revenue, 'orders', o.orders,
          'spend', o.spend, 'visitors', coalesce(v.visitors, 0)) AS x
        FROM (SELECT source, sum(revenue) revenue, count(*) orders, sum(alloc_spend) spend FROM ord GROUP BY source) o
        LEFT JOIN (SELECT source, count(DISTINCT session_id) visitors FROM t GROUP BY source) v ON v.source = o.source
        ORDER BY o.revenue DESC
      ) s
    ),
    'by_medium', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', o.medium, 'revenue', o.revenue, 'orders', o.orders,
          'spend', o.spend, 'visitors', coalesce(v.visitors, 0)) AS x
        FROM (SELECT medium, sum(revenue) revenue, count(*) orders, sum(alloc_spend) spend FROM ord GROUP BY medium) o
        LEFT JOIN (SELECT medium, count(DISTINCT session_id) visitors FROM t GROUP BY medium) v ON v.medium = o.medium
        ORDER BY o.revenue DESC
      ) s
    ),
    'by_utm_campaign', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', o.utm_campaign, 'revenue', o.revenue, 'orders', o.orders,
          'spend', o.spend, 'visitors', coalesce(v.visitors, 0)) AS x
        FROM (SELECT utm_campaign, sum(revenue) revenue, count(*) orders, sum(alloc_spend) spend FROM ord GROUP BY utm_campaign) o
        LEFT JOIN (SELECT utm_campaign, count(DISTINCT session_id) visitors FROM t GROUP BY utm_campaign) v ON v.utm_campaign = o.utm_campaign
        ORDER BY o.revenue DESC
      ) s
    ),
    'by_country', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', country, 'revenue', sum(revenue), 'orders', count(*), 'spend', sum(alloc_spend)) AS x
        FROM ord GROUP BY country ORDER BY sum(revenue) DESC
      ) s
    ),
    'by_region', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', region, 'revenue', sum(revenue), 'orders', count(*), 'spend', sum(alloc_spend)) AS x
        FROM ord GROUP BY region ORDER BY sum(revenue) DESC
      ) s
    ),
    'by_device', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', device, 'revenue', sum(revenue), 'orders', count(*), 'spend', sum(alloc_spend)) AS x
        FROM ord GROUP BY device ORDER BY sum(revenue) DESC
      ) s
    ),
    'attribution_models', (
      SELECT coalesce(jsonb_agg(x ORDER BY (x->>'last_revenue')::numeric DESC NULLS LAST), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'campaign_id', mc.id, 'key', mc.name, 'type', mc.campaign_type,
          'spend', mc.spend,
          'first_conversions', coalesce(fc.conv, 0), 'first_revenue', coalesce(fc.rev, 0),
          'last_conversions', coalesce(lc.conv, 0), 'last_revenue', coalesce(lc.rev, 0),
          'linear_conversions', coalesce(ln.conv, 0), 'linear_revenue', coalesce(ln.rev, 0),
          'time_decay_conversions', coalesce(td.conv, 0), 'time_decay_revenue', coalesce(td.rev, 0)
        ) AS x
        FROM marketing_campaigns mc
        LEFT JOIN (
          SELECT first_touch_campaign_id cid, count(*) conv, sum(revenue) rev FROM oa
          WHERE first_touch_campaign_id IS NOT NULL
            AND (first_touch_at IS NULL OR order_created_at - first_touch_at <= make_interval(days => p_window_days))
          GROUP BY 1
        ) fc ON fc.cid = mc.id
        LEFT JOIN (
          SELECT last_touch_campaign_id cid, count(*) conv, sum(revenue) rev FROM oa
          WHERE last_touch_campaign_id IS NOT NULL
            AND (last_touch_at IS NULL OR order_created_at - last_touch_at <= make_interval(days => p_window_days))
          GROUP BY 1
        ) lc ON lc.cid = mc.id
        LEFT JOIN (
          SELECT campaign_id cid, sum(1.0 / n) conv, sum(revenue / n) rev FROM tpo2 GROUP BY 1
        ) ln ON ln.cid = mc.id
        LEFT JOIN (
          SELECT campaign_id cid, sum(CASE WHEN wsum > 0 THEN w / wsum ELSE 0 END) conv,
            sum(CASE WHEN wsum > 0 THEN revenue * w / wsum ELSE 0 END) rev FROM tpo2 GROUP BY 1
        ) td ON td.cid = mc.id
        WHERE coalesce(fc.conv, lc.conv, ln.conv, td.conv, 0) > 0 OR mc.spend > 0
      ) s
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.svc_acquisition_metrics(timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_acquisition_metrics(timestamptz, int) TO service_role;