CREATE OR REPLACE FUNCTION public.admin_staff_performance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','fulfillment','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH fulfil_acts AS (
    SELECT al.actor_id AS uid, al.action, al.created_at,
      CASE WHEN al.metadata->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (al.metadata->>'order_id')::uuid END AS order_id
    FROM public.admin_activity_logs al
    WHERE al.actor_id IS NOT NULL
      AND (al.action ILIKE '%pack%' OR al.action ILIKE '%ship%'
           OR al.action ILIKE '%refund%' OR al.action ILIKE '%return%')
  ),
  perf AS (
    SELECT fa.uid,
      pr.full_name, pr.avatar_url,
      count(*) FILTER (WHERE fa.action ILIKE '%pack%') AS packed,
      count(*) FILTER (WHERE fa.action ILIKE '%ship%') AS shipped,
      count(*) FILTER (WHERE fa.action ILIKE '%refund%' OR fa.action ILIKE '%return%') AS refunds_handled,
      count(*) AS total_actions,
      max(fa.created_at) AS last_action,
      avg(EXTRACT(EPOCH FROM (fa.created_at - o.created_at))/3600.0)
        FILTER (WHERE o.created_at IS NOT NULL
          AND (fa.action ILIKE '%pack%' OR fa.action ILIKE '%ship%')) AS avg_handling_hours
    FROM fulfil_acts fa
    LEFT JOIN public.profiles pr ON pr.id = fa.uid
    LEFT JOIN public.orders o ON o.id = fa.order_id
    GROUP BY fa.uid, pr.full_name, pr.avatar_url
  ),
  roles AS (
    SELECT user_id, array_agg(DISTINCT role::text) AS roles
    FROM public.user_roles GROUP BY user_id
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'staff', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'uid', p.uid,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'roles', coalesce(r.roles, ARRAY[]::text[]),
        'packed', p.packed,
        'shipped', p.shipped,
        'refunds_handled', p.refunds_handled,
        'total_actions', p.total_actions,
        'last_action', p.last_action,
        'avg_handling_hours', round(p.avg_handling_hours::numeric, 2)
      ) ORDER BY p.total_actions DESC), '[]'::jsonb)
      FROM perf p LEFT JOIN roles r ON r.user_id = p.uid
    )
  ) INTO result;

  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_staff_performance() TO authenticated;