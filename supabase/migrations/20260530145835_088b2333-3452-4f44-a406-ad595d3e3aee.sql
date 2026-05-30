-- ============================================================
-- P1 — Marketing Automation Control Engine completion
-- ============================================================

-- 1. Execution timing / retry / control columns
ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS duration_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_permanently boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- 2. Global safety controls (singleton)
CREATE TABLE IF NOT EXISTS public.automation_settings (
  id               boolean PRIMARY KEY DEFAULT true,
  emergency_stop   boolean NOT NULL DEFAULT false,
  global_pause     boolean NOT NULL DEFAULT false,
  maintenance_mode boolean NOT NULL DEFAULT false,
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_settings_singleton CHECK (id)
);

INSERT INTO public.automation_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation settings staff read" ON public.automation_settings;
CREATE POLICY "automation settings staff read"
ON public.automation_settings FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_settings;

-- Staff-only setter (audited)
CREATE OR REPLACE FUNCTION public.set_automation_settings(
  p_emergency boolean, p_global boolean, p_maintenance boolean
) RETURNS public.automation_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.automation_settings;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to change automation controls';
  END IF;
  UPDATE public.automation_settings
  SET emergency_stop = p_emergency,
      global_pause = p_global,
      maintenance_mode = p_maintenance,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = true
  RETURNING * INTO v_row;

  INSERT INTO admin_activity_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'automation.controls_changed', 'automation_settings', 'global',
    jsonb_build_object('emergency_stop', p_emergency, 'global_pause', p_global, 'maintenance_mode', p_maintenance));
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_automation_settings(boolean, boolean, boolean) TO authenticated;

-- 3. Rewritten execution engine with controls, timing & rich notifications
CREATE OR REPLACE FUNCTION public.run_marketing_automations(
  p_force boolean DEFAULT false,
  p_triggered_by text DEFAULT 'cron',
  p_only_automation uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor          uuid := auth.uid();
  v_run_id         uuid := gen_random_uuid();
  a                record;
  v_count          integer;
  v_summary        text;
  v_details        jsonb;
  v_action         text;
  v_cadence        integer;
  v_status         text;
  v_action_taken   text;
  v_campaign_id    uuid;
  v_total_runs     integer := 0;
  v_total_actions  integer := 0;
  v_total_matches  integer := 0;
  v_total_failed   integer := 0;
  v_now            timestamptz := now();
  v_started        timestamptz;
  v_dur            integer;
  v_blocked        boolean := false;
  v_settings       public.automation_settings;
  v_prev_failed    boolean;
  v_large          integer;
BEGIN
  IF v_actor IS NOT NULL AND NOT has_any_role(v_actor, ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to run automations';
  END IF;

  SELECT * INTO v_settings FROM public.automation_settings WHERE id = true;
  v_blocked := COALESCE(v_settings.emergency_stop, false)
            OR COALESCE(v_settings.global_pause, false)
            OR COALESCE(v_settings.maintenance_mode, false);

  v_large := 500; -- large audience threshold for notification

  FOR a IN
    SELECT * FROM public.marketing_automations
    WHERE enabled = true AND status = 'active'
      AND (p_only_automation IS NULL OR id = p_only_automation)
    ORDER BY priority DESC
  LOOP
    v_cadence := COALESCE((a.schedule->>'cadence_minutes')::int, 360);
    IF NOT p_force AND a.last_run_at IS NOT NULL
       AND a.last_run_at > v_now - make_interval(mins => v_cadence) THEN
      CONTINUE;
    END IF;

    v_started := clock_timestamp();
    v_count := 0; v_summary := NULL; v_details := '{}'::jsonb;
    v_status := 'success'; v_action_taken := NULL; v_campaign_id := NULL;

    -- was the previous execution for this automation a failure? (for recovery notice)
    SELECT (status = 'failed') INTO v_prev_failed
    FROM automation_executions
    WHERE automation_id = a.id
    ORDER BY created_at DESC LIMIT 1;

    BEGIN
      -- ---------------- TRIGGER EVALUATION (live data) ----------------
      IF a.trigger_key IN ('segment_vip','tag_high_value') THEN
        SELECT count(*) INTO v_count FROM (
          SELECT o.user_id FROM orders o
          JOIN profiles p ON p.id = o.user_id
          WHERE NOT o.is_seeded AND o.status NOT IN ('cancelled')
          GROUP BY o.user_id
          HAVING sum(o.total) >= COALESCE((a.action_config->>'min_spend')::numeric, 50000)
        ) q;
        v_summary := v_count || ' high-value customers qualify';

      ELSIF a.trigger_key IN ('segment_loyal','lifecycle_repeat') THEN
        SELECT count(*) INTO v_count FROM (
          SELECT o.user_id FROM orders o
          WHERE NOT o.is_seeded AND o.status NOT IN ('cancelled')
          GROUP BY o.user_id
          HAVING count(*) >= 3 AND max(o.created_at) > v_now - interval '60 days'
        ) q;
        v_summary := v_count || ' loyal repeat customers';

      ELSIF a.trigger_key = 'segment_at_risk' THEN
        SELECT count(*) INTO v_count FROM (
          SELECT o.user_id FROM orders o
          WHERE NOT o.is_seeded AND o.status NOT IN ('cancelled')
          GROUP BY o.user_id
          HAVING count(*) >= 2
             AND max(o.created_at) BETWEEN v_now - interval '120 days' AND v_now - interval '60 days'
        ) q;
        v_summary := v_count || ' customers showing churn risk';

      ELSIF a.trigger_key IN ('segment_dormant','lifecycle_winback','lifecycle_inactive') THEN
        SELECT count(*) INTO v_count FROM (
          SELECT o.user_id FROM orders o
          WHERE NOT o.is_seeded AND o.status NOT IN ('cancelled')
          GROUP BY o.user_id
          HAVING max(o.created_at) < v_now - interval '120 days'
        ) q;
        v_summary := v_count || ' dormant customers to win back';

      ELSIF a.trigger_key IN ('segment_new','lifecycle_welcome','lifecycle_first_purchase') THEN
        SELECT count(*) INTO v_count FROM profiles p
        WHERE NOT p.is_seeded AND p.created_at > v_now - interval '30 days';
        v_summary := v_count || ' new customers in last 30 days';

      ELSIF a.trigger_key = 'tag_refund_heavy' THEN
        SELECT count(*) INTO v_count FROM (
          SELECT o.user_id FROM returns r
          JOIN orders o ON o.id = r.order_id
          WHERE NOT o.is_seeded
          GROUP BY o.user_id HAVING count(*) >= 2
        ) q;
        v_summary := v_count || ' refund-heavy customers';

      ELSIF a.trigger_key = 'inv_low_stock' THEN
        SELECT count(*) INTO v_count FROM products
        WHERE status = 'published' AND in_stock
          AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold;
        v_summary := v_count || ' products low on stock';

      ELSIF a.trigger_key = 'inv_back_in_stock' THEN
        SELECT count(*) INTO v_count FROM products
        WHERE status = 'published' AND stock_quantity > low_stock_threshold AND in_stock;
        v_summary := v_count || ' products well stocked';

      ELSIF a.trigger_key IN ('inv_dead','inv_clearance') THEN
        SELECT count(*) INTO v_count FROM products pr
        WHERE pr.status = 'published' AND pr.stock_quantity > 0
          AND NOT EXISTS (
            SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = pr.id AND NOT o.is_seeded
              AND o.created_at > v_now - interval '60 days'
          );
        v_summary := v_count || ' dead-stock products (no sales 60d)';

      ELSIF a.trigger_key = 'inv_overstock' THEN
        SELECT count(*) INTO v_count FROM products
        WHERE status = 'published'
          AND stock_quantity >= COALESCE((a.action_config->>'overstock_qty')::int, 100);
        v_summary := v_count || ' overstocked products';

      ELSIF a.trigger_key IN ('inv_fast','prod_bestsellers','prod_trending') THEN
        SELECT count(*) INTO v_count FROM (
          SELECT oi.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE NOT o.is_seeded AND o.created_at > v_now - interval '30 days'
          GROUP BY oi.product_id HAVING sum(oi.quantity) >= COALESCE((a.action_config->>'min_units')::int, 10)
        ) q;
        v_summary := v_count || ' fast-moving products (30d)';

      ELSIF a.trigger_key = 'prod_high_margin' THEN
        SELECT count(*) INTO v_count FROM products
        WHERE status = 'published' AND price > 0 AND cost > 0
          AND (price - cost) / price >= COALESCE((a.action_config->>'min_margin')::numeric, 0.4);
        v_summary := v_count || ' high-margin products';

      ELSIF a.trigger_key = 'prod_new' THEN
        SELECT count(*) INTO v_count FROM products
        WHERE status = 'published' AND created_at > v_now - interval '21 days';
        v_summary := v_count || ' new arrivals';

      ELSIF a.trigger_key = 'revenue_target' THEN
        SELECT CASE WHEN COALESCE(sum((metrics->>'revenue')::numeric),0)
               >= COALESCE((a.action_config->>'target')::numeric,100000) THEN 1 ELSE 0 END
          INTO v_count FROM marketing_campaigns;
        v_summary := CASE WHEN v_count > 0 THEN 'Revenue target reached' ELSE 'Revenue below target' END;

      ELSIF a.trigger_key = 'profit_target' THEN
        SELECT CASE WHEN COALESCE(sum((metrics->>'profit')::numeric),0)
               >= COALESCE((a.action_config->>'target')::numeric,50000) THEN 1 ELSE 0 END
          INTO v_count FROM marketing_campaigns;
        v_summary := CASE WHEN v_count > 0 THEN 'Profit target reached' ELSE 'Profit below target' END;

      ELSE
        v_count := 0;
        v_summary := 'No live evaluator for trigger ' || a.trigger_key;
        v_status := 'skipped';
      END IF;

      v_total_matches := v_total_matches + COALESCE(v_count, 0);

      -- ---------------- ACTION EXECUTION (skipped while blocked) ----------------
      v_action := COALESCE(a.action_config->>'action',
                           CASE WHEN a.channel = 'notification' THEN 'notify' ELSE 'create_campaign' END);

      IF v_blocked AND v_count > 0 AND v_status <> 'skipped' THEN
        v_action_taken := 'blocked';
      ELSIF v_count > 0 AND v_status <> 'skipped' THEN
        IF v_action IN ('create_campaign','schedule_campaign') THEN
          IF NOT EXISTS (
            SELECT 1 FROM marketing_campaigns
            WHERE automation_id = a.id AND status IN ('active','scheduled')
          ) THEN
            INSERT INTO marketing_campaigns
              (name, campaign_type, automation_id, region, segment, status, audience_size, config, metrics, scheduled_at, launched_at, created_by)
            VALUES (
              a.name, a.trigger_key, a.id, a.region,
              a.action_config->>'segment',
              CASE WHEN v_action = 'schedule_campaign' THEN 'scheduled' ELSE 'active' END,
              v_count, a.action_config, '{}'::jsonb,
              CASE WHEN v_action = 'schedule_campaign'
                   THEN v_now + make_interval(mins => COALESCE((a.action_config->>'delay_minutes')::int, 60))
                   ELSE NULL END,
              CASE WHEN v_action = 'create_campaign' THEN v_now ELSE NULL END,
              v_actor
            ) RETURNING id INTO v_campaign_id;
            v_action_taken := v_action;
            v_total_actions := v_total_actions + 1;

            PERFORM notify_staff('automation', 'Campaign auto-created',
              a.name || ' created a campaign for ' || v_count || ' matched records',
              '/admin-marketing-automation?tab=executions', 'normal',
              jsonb_build_object('automation_id', a.id, 'campaign_id', v_campaign_id, 'matched', v_count));
          ELSE
            v_action_taken := 'campaign_exists';
          END IF;

        ELSIF v_action = 'pause_campaign' THEN
          UPDATE marketing_campaigns SET status = 'paused'
          WHERE automation_id = a.id AND status = 'active';
          v_action_taken := 'pause_campaign';
          v_total_actions := v_total_actions + 1;

        ELSE
          v_action_taken := 'notify';
        END IF;

        -- large audience notice
        IF v_count >= v_large THEN
          PERFORM notify_staff('automation', 'Large audience matched',
            a.name || ' matched ' || v_count || ' records',
            '/admin-marketing-automation?tab=executions', 'high',
            jsonb_build_object('automation_id', a.id, 'matched', v_count));
        END IF;

        PERFORM notify_staff(
          'automation', a.name || ' triggered', v_summary,
          '/admin-marketing-automation?tab=executions',
          CASE WHEN a.priority >= 5 THEN 'high' ELSE 'normal' END,
          jsonb_build_object('automation_id', a.id, 'trigger_key', a.trigger_key, 'matched', v_count, 'campaign_id', v_campaign_id));

        INSERT INTO admin_activity_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (v_actor, 'automation.executed', 'automation', a.id::text,
          jsonb_build_object('trigger_key', a.trigger_key, 'matched', v_count, 'action', v_action_taken, 'campaign_id', v_campaign_id, 'run_id', v_run_id));
      END IF;

      -- recovery notice: previously failed, now succeeded
      IF v_prev_failed AND v_status <> 'skipped' THEN
        PERFORM notify_staff('automation', 'Automation recovered',
          a.name || ' ran successfully after a previous failure',
          '/admin-marketing-automation?tab=executions', 'normal',
          jsonb_build_object('automation_id', a.id));
      END IF;

      v_dur := GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int);
      v_details := jsonb_build_object('cadence_minutes', v_cadence, 'channel', a.channel, 'region', a.region, 'blocked', v_blocked);

      INSERT INTO automation_executions
        (run_id, automation_id, trigger_key, status, matched_count, action_taken, summary, details, campaign_id, triggered_by, actor_id, duration_ms, blocked)
      VALUES (v_run_id, a.id, a.trigger_key,
        CASE WHEN v_count > 0 AND v_status <> 'skipped' THEN 'success' ELSE v_status END,
        v_count, v_action_taken, v_summary, v_details, v_campaign_id, p_triggered_by, v_actor, v_dur, v_blocked);

      UPDATE marketing_automations SET last_run_at = v_now WHERE id = a.id;
      v_total_runs := v_total_runs + 1;

    EXCEPTION WHEN OTHERS THEN
      v_dur := GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int);
      INSERT INTO automation_executions
        (run_id, automation_id, trigger_key, status, matched_count, summary, error, triggered_by, actor_id, duration_ms, blocked)
      VALUES (v_run_id, a.id, a.trigger_key, 'failed', 0, 'Execution error', SQLERRM, p_triggered_by, v_actor, v_dur, v_blocked);
      v_total_runs := v_total_runs + 1;
      v_total_failed := v_total_failed + 1;

      PERFORM notify_staff('automation', 'Automation failed',
        a.name || ' failed: ' || left(SQLERRM, 160),
        '/admin-marketing-automation?tab=executions', 'high',
        jsonb_build_object('automation_id', a.id, 'error', left(SQLERRM, 200)));
    END;
  END LOOP;

  -- run-level success-rate notifications (only for meaningful runs)
  IF v_total_runs >= 3 THEN
    IF v_total_failed = 0 THEN
      PERFORM notify_staff('automation', 'High automation success rate',
        'All ' || v_total_runs || ' automations ran successfully',
        '/admin-marketing-automation?tab=executions', 'low',
        jsonb_build_object('run_id', v_run_id, 'total', v_total_runs));
    ELSIF (v_total_runs - v_total_failed)::numeric / v_total_runs < 0.8 THEN
      PERFORM notify_staff('automation', 'Low automation success rate',
        v_total_failed || ' of ' || v_total_runs || ' automations failed',
        '/admin-marketing-automation?tab=executions', 'high',
        jsonb_build_object('run_id', v_run_id, 'failed', v_total_failed, 'total', v_total_runs));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'automations_evaluated', v_total_runs,
    'actions_taken', v_total_actions,
    'total_matches', v_total_matches,
    'failures', v_total_failed,
    'blocked', v_blocked,
    'ran_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_marketing_automations(boolean, text, uuid) TO authenticated;

-- 4. Retry a single failed execution (re-evaluates that automation, tracks attempts)
CREATE OR REPLACE FUNCTION public.retry_failed_execution(p_execution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exec   automation_executions;
  v_result jsonb;
  v_next   integer;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to retry automations';
  END IF;

  SELECT * INTO v_exec FROM automation_executions WHERE id = p_execution_id;
  IF v_exec.id IS NULL THEN RAISE EXCEPTION 'Execution not found'; END IF;
  IF v_exec.failed_permanently THEN RAISE EXCEPTION 'Execution already failed permanently'; END IF;
  IF v_exec.automation_id IS NULL THEN RAISE EXCEPTION 'Automation no longer exists'; END IF;

  v_next := v_exec.retry_count + 1;
  v_result := public.run_marketing_automations(true, 'manual', v_exec.automation_id);

  UPDATE automation_executions
  SET retry_count = v_next,
      failed_permanently = (v_next >= 3)
  WHERE id = p_execution_id;

  RETURN jsonb_build_object('execution_id', p_execution_id, 'attempt', v_next,
    'failed_permanently', (v_next >= 3), 'result', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_failed_execution(uuid) TO authenticated;

-- 5. Retry all failed (non-permanent) executions in one pass
CREATE OR REPLACE FUNCTION public.retry_all_failed_executions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
  v_count  integer := 0;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]) THEN
    RAISE EXCEPTION 'Not authorised to retry automations';
  END IF;

  SELECT count(*) INTO v_count
  FROM automation_executions
  WHERE status = 'failed' AND NOT failed_permanently;

  v_result := public.run_marketing_automations(true, 'manual', NULL);

  UPDATE automation_executions
  SET retry_count = retry_count + 1,
      failed_permanently = (retry_count + 1 >= 3)
  WHERE status = 'failed' AND NOT failed_permanently;

  RETURN jsonb_build_object('retried', v_count, 'result', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_all_failed_executions() TO authenticated;