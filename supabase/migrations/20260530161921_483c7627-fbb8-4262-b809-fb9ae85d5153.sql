-- Aggregated campaign metrics (real events + attributed revenue).
CREATE OR REPLACE FUNCTION public.svc_campaign_metrics(p_since timestamptz, p_window_days int)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH ev AS (
    SELECT campaign_id,
      count(*) FILTER (WHERE event_type='open')  AS opens,
      count(*) FILTER (WHERE event_type='click') AS clicks
    FROM campaign_events
    WHERE created_at >= p_since AND campaign_id IS NOT NULL
    GROUP BY campaign_id
  ),
  lconv AS (
    SELECT last_touch_campaign_id AS campaign_id,
      count(*) AS conversions,
      coalesce(sum(revenue),0) AS revenue
    FROM order_attributions
    WHERE last_touch_campaign_id IS NOT NULL
      AND order_created_at >= p_since
      AND (last_touch_at IS NULL OR order_created_at - last_touch_at <= make_interval(days => p_window_days))
    GROUP BY last_touch_campaign_id
  ),
  fconv AS (
    SELECT first_touch_campaign_id AS campaign_id,
      count(*) AS conversions,
      coalesce(sum(revenue),0) AS revenue
    FROM order_attributions
    WHERE first_touch_campaign_id IS NOT NULL
      AND order_created_at >= p_since
      AND (first_touch_at IS NULL OR order_created_at - first_touch_at <= make_interval(days => p_window_days))
    GROUP BY first_touch_campaign_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'campaign_id', c.id,
    'name', c.name,
    'campaign_type', c.campaign_type,
    'status', c.status,
    'spend', c.spend,
    'currency', coalesce(lconv.revenue, fconv.revenue, 0),
    'audience_size', c.audience_size,
    'launched_at', c.launched_at,
    'created_at', c.created_at,
    'opens', coalesce(ev.opens,0),
    'clicks', coalesce(ev.clicks,0),
    'last_conversions', coalesce(lconv.conversions,0),
    'last_revenue', coalesce(lconv.revenue,0),
    'first_conversions', coalesce(fconv.conversions,0),
    'first_revenue', coalesce(fconv.revenue,0)
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM marketing_campaigns c
  LEFT JOIN ev    ON ev.campaign_id    = c.id
  LEFT JOIN lconv ON lconv.campaign_id = c.id
  LEFT JOIN fconv ON fconv.campaign_id = c.id;
$$;

REVOKE ALL ON FUNCTION public.svc_campaign_metrics(timestamptz,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_campaign_metrics(timestamptz,int) TO service_role;

-- Day-by-day campaign timeline.
CREATE OR REPLACE FUNCTION public.svc_campaign_timeline(p_campaign uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH days AS (
    SELECT generate_series(date_trunc('day', p_since), date_trunc('day', now()), interval '1 day') AS d
  ),
  ev AS (
    SELECT date_trunc('day', created_at) AS d,
      count(*) FILTER (WHERE event_type='open')  AS opens,
      count(*) FILTER (WHERE event_type='click') AS clicks
    FROM campaign_events
    WHERE campaign_id = p_campaign AND created_at >= p_since
    GROUP BY 1
  ),
  rev AS (
    SELECT date_trunc('day', order_created_at) AS d,
      count(*) AS conversions,
      coalesce(sum(revenue),0) AS revenue
    FROM order_attributions
    WHERE last_touch_campaign_id = p_campaign AND order_created_at >= p_since
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(days.d, 'YYYY-MM-DD'),
    'opens', coalesce(ev.opens,0),
    'clicks', coalesce(ev.clicks,0),
    'conversions', coalesce(rev.conversions,0),
    'revenue', coalesce(rev.revenue,0)
  ) ORDER BY days.d), '[]'::jsonb)
  FROM days
  LEFT JOIN ev  ON ev.d  = days.d
  LEFT JOIN rev ON rev.d = days.d;
$$;

REVOKE ALL ON FUNCTION public.svc_campaign_timeline(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svc_campaign_timeline(uuid,timestamptz) TO service_role;