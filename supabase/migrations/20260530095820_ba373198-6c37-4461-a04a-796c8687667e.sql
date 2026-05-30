CREATE TABLE public.marketing_campaign_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  alert_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, alert_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_alerts TO authenticated;
GRANT ALL ON public.marketing_campaign_alerts TO service_role;

ALTER TABLE public.marketing_campaign_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing alerts staff read"
ON public.marketing_campaign_alerts FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE POLICY "marketing alerts staff insert"
ON public.marketing_campaign_alerts FOR INSERT
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

-- Helper: record an alert; returns true only the first time (dedup)
CREATE OR REPLACE FUNCTION public.try_fire_campaign_alert(_campaign_id uuid, _alert_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.marketing_campaign_alerts(campaign_id, alert_key)
  VALUES (_campaign_id, _alert_key) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END
$function$;

CREATE OR REPLACE FUNCTION public.ops_notify_marketing_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  link text := '/admin-marketing-automation?tab=campaigns&campaign=' || NEW.id::text;
  roles app_role[] := ARRAY['admin','super_admin','manager','editor']::app_role[];
  m jsonb := COALESCE(NEW.metrics, '{}'::jsonb);
  v_revenue numeric := COALESCE((m->>'revenue')::numeric, 0);
  v_profit  numeric := COALESCE((m->>'profit')::numeric, 0);
  v_cost    numeric := COALESCE((m->>'cost')::numeric, 0);
  v_reached numeric := COALESCE((m->>'reached')::numeric, 0);
  v_conv    numeric := COALESCE((m->>'conversions')::numeric, 0);
  v_roi numeric;
  v_cr numeric;
  v_budget numeric := COALESCE((NEW.config->>'budget')::numeric, 0);
  conflict_name text;
BEGIN
  v_roi := CASE WHEN v_cost > 0 THEN v_profit / v_cost ELSE NULL END;
  v_cr  := CASE WHEN v_reached > 0 THEN v_conv / v_reached ELSE NULL END;

  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    IF try_fire_campaign_alert(NEW.id, 'completed') THEN
      PERFORM notify_roles(roles, 'ops_marketing_completed',
        'Campaign completed: ' || NEW.name,
        'Campaign finished with ' || round(v_revenue)::text || ' revenue from ' || round(v_conv)::text || ' conversions.',
        link, jsonb_build_object('campaign_id', NEW.id, 'revenue', v_revenue), 'normal');
    END IF;
  END IF;

  IF NEW.status = 'failed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'failed') THEN
    IF try_fire_campaign_alert(NEW.id, 'failed') THEN
      PERFORM notify_roles(roles, 'ops_marketing_failed',
        'Campaign failed: ' || NEW.name,
        'Campaign "' || NEW.name || '" could not run and needs attention.',
        link, jsonb_build_object('campaign_id', NEW.id), 'critical');
    END IF;
  END IF;

  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF try_fire_campaign_alert(NEW.id, 'launched') THEN
      PERFORM notify_roles(roles, 'ops_marketing_launched',
        'Campaign launched: ' || NEW.name,
        'Campaign is now live for an audience of ' || NEW.audience_size::text || '.',
        link, jsonb_build_object('campaign_id', NEW.id), 'important');
    END IF;
  END IF;

  IF v_reached >= 50 THEN
    IF v_roi IS NOT NULL AND v_roi >= 3 THEN
      IF try_fire_campaign_alert(NEW.id, 'overperforming') THEN
        PERFORM notify_roles(roles, 'ops_marketing_overperforming',
          'Campaign over-performing: ' || NEW.name,
          'ROI is ' || round(v_roi*100)::text || '%. Consider scaling budget.',
          link, jsonb_build_object('campaign_id', NEW.id, 'roi', v_roi), 'important');
      END IF;
    END IF;

    IF v_roi IS NOT NULL AND v_roi < 0.5 AND v_roi >= 0 THEN
      IF try_fire_campaign_alert(NEW.id, 'underperforming') THEN
        PERFORM notify_roles(roles, 'ops_marketing_underperforming',
          'Campaign under-performing: ' || NEW.name,
          'ROI is only ' || round(v_roi*100)::text || '%. Review targeting or offer.',
          link, jsonb_build_object('campaign_id', NEW.id, 'roi', v_roi), 'important');
      END IF;
    END IF;

    IF v_roi IS NOT NULL AND v_roi < 0 THEN
      IF try_fire_campaign_alert(NEW.id, 'roi_drop') THEN
        PERFORM notify_roles(roles, 'ops_marketing_roi_drop',
          'ROI drop: ' || NEW.name,
          'Campaign is losing money (ROI ' || round(v_roi*100)::text || '%). Pause or fix.',
          link, jsonb_build_object('campaign_id', NEW.id, 'roi', v_roi), 'critical');
      END IF;
    END IF;

    IF v_cr IS NOT NULL AND v_cr < 0.01 THEN
      IF try_fire_campaign_alert(NEW.id, 'conversion_drop') THEN
        PERFORM notify_roles(roles, 'ops_marketing_conversion_drop',
          'Low conversion: ' || NEW.name,
          'Conversion rate is ' || round(v_cr*100, 2)::text || '%. Audience may be mismatched.',
          link, jsonb_build_object('campaign_id', NEW.id, 'conversion_rate', v_cr), 'important');
      END IF;
    END IF;
  END IF;

  IF v_budget > 0 AND v_cost >= v_budget * 0.9 THEN
    IF try_fire_campaign_alert(NEW.id, 'budget_threshold') THEN
      PERFORM notify_roles(roles, 'ops_marketing_budget',
        'Budget threshold: ' || NEW.name,
        'Spend reached ' || round((v_cost / v_budget) * 100)::text || '% of budget.',
        link, jsonb_build_object('campaign_id', NEW.id, 'cost', v_cost, 'budget', v_budget), 'important');
    END IF;
  END IF;

  IF NEW.status IN ('active','scheduled') AND jsonb_typeof(NEW.config->'product_slugs') = 'array' THEN
    SELECT p.name INTO conflict_name
    FROM public.products p
    WHERE p.slug IN (SELECT jsonb_array_elements_text(NEW.config->'product_slugs'))
      AND (p.in_stock = false OR p.stock_quantity <= 0)
    LIMIT 1;
    IF conflict_name IS NOT NULL THEN
      IF try_fire_campaign_alert(NEW.id, 'inventory_conflict') THEN
        PERFORM notify_roles(roles, 'ops_marketing_inventory_conflict',
          'Inventory conflict: ' || NEW.name,
          'Campaign promotes "' || conflict_name || '" which is out of stock.',
          link, jsonb_build_object('campaign_id', NEW.id), 'critical');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_ops_notify_marketing_campaign
AFTER INSERT OR UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.ops_notify_marketing_campaign();