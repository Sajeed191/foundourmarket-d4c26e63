-- =========================================================================
-- P2-A Marketing Metrics Tracking — real attribution & engagement schema
-- =========================================================================

-- 1. Campaign spend (for ROAS / CAC / CPA). Real, admin-entered cost.
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS spend numeric NOT NULL DEFAULT 0;

-- 2. Order attribution carriers (nullable, low-risk additive columns).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS attribution_session_id text,
  ADD COLUMN IF NOT EXISTS attribution_utm jsonb;

-- =========================================================================
-- campaign_links — trackable links/tokens attached to a campaign
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.campaign_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text,
  target_url text NOT NULL,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign ON public.campaign_links(campaign_id);

GRANT SELECT ON public.campaign_links TO authenticated;
GRANT ALL ON public.campaign_links TO service_role;
ALTER TABLE public.campaign_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_links staff read" ON public.campaign_links FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

-- =========================================================================
-- campaign_events — unified real engagement stream (opens + clicks)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.campaign_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.campaign_links(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('open','click')),
  recipient_email text,
  user_id uuid,
  session_id text,
  message_id text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign ON public.campaign_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_events_type ON public.campaign_events(event_type);

GRANT SELECT ON public.campaign_events TO authenticated;
GRANT ALL ON public.campaign_events TO service_role;
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_events staff read" ON public.campaign_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

-- =========================================================================
-- attribution_touches — first/last touch per visitor session
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.attribution_touches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text NOT NULL,
  user_id uuid,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_path text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attr_touches_session ON public.attribution_touches(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attr_touches_campaign ON public.attribution_touches(campaign_id);

-- Guests + users record their own touches (insert only, no read).
GRANT INSERT ON public.attribution_touches TO anon, authenticated;
GRANT SELECT ON public.attribution_touches TO authenticated;
GRANT ALL ON public.attribution_touches TO service_role;
ALTER TABLE public.attribution_touches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attr_touches public insert" ON public.attribution_touches FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "attr_touches staff read" ON public.attribution_touches FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

-- =========================================================================
-- order_attributions — ties completed orders to campaigns (revenue)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.order_attributions (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  session_id text,
  user_id uuid,
  first_touch_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  last_touch_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  first_touch_at timestamptz,
  last_touch_at timestamptz,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  revenue numeric NOT NULL DEFAULT 0,
  currency text,
  order_created_at timestamptz,
  attributed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_attr_first ON public.order_attributions(first_touch_campaign_id);
CREATE INDEX IF NOT EXISTS idx_order_attr_last ON public.order_attributions(last_touch_campaign_id);

GRANT SELECT ON public.order_attributions TO authenticated;
GRANT ALL ON public.order_attributions TO service_role;
ALTER TABLE public.order_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_attr staff read" ON public.order_attributions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

-- =========================================================================
-- attribute_order() — builds first/last touch revenue attribution on payment
-- =========================================================================
CREATE OR REPLACE FUNCTION public.attribute_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first record;
  v_last record;
  v_paid boolean;
BEGIN
  v_paid := (NEW.payment_status = 'paid')
            OR (NEW.status IN ('confirmed','completed','paid','fulfilled','delivered','shipped'));

  IF NOT v_paid OR NEW.attribution_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only act when the order first becomes attributable.
  IF TG_OP = 'UPDATE'
     AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status
     AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT t.campaign_id, t.created_at INTO v_last
  FROM attribution_touches t
  WHERE (t.session_id = NEW.attribution_session_id
         OR (NEW.user_id IS NOT NULL AND t.user_id = NEW.user_id))
    AND t.campaign_id IS NOT NULL
    AND t.created_at <= NEW.created_at
    AND t.created_at >= NEW.created_at - interval '30 days'
  ORDER BY t.created_at DESC
  LIMIT 1;

  SELECT t.campaign_id, t.created_at INTO v_first
  FROM attribution_touches t
  WHERE (t.session_id = NEW.attribution_session_id
         OR (NEW.user_id IS NOT NULL AND t.user_id = NEW.user_id))
    AND t.campaign_id IS NOT NULL
    AND t.created_at <= NEW.created_at
    AND t.created_at >= NEW.created_at - interval '30 days'
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF v_first.campaign_id IS NULL AND v_last.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO order_attributions(
    order_id, session_id, user_id,
    first_touch_campaign_id, last_touch_campaign_id,
    first_touch_at, last_touch_at,
    utm, revenue, currency, order_created_at
  ) VALUES (
    NEW.id, NEW.attribution_session_id, NEW.user_id,
    v_first.campaign_id, v_last.campaign_id,
    v_first.created_at, v_last.created_at,
    COALESCE(NEW.attribution_utm, '{}'::jsonb), COALESCE(NEW.total, 0), NEW.currency, NEW.created_at
  )
  ON CONFLICT (order_id) DO UPDATE SET
    first_touch_campaign_id = EXCLUDED.first_touch_campaign_id,
    last_touch_campaign_id = EXCLUDED.last_touch_campaign_id,
    first_touch_at = EXCLUDED.first_touch_at,
    last_touch_at = EXCLUDED.last_touch_at,
    revenue = EXCLUDED.revenue,
    currency = EXCLUDED.currency,
    attributed_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attribute_order ON public.orders;
CREATE TRIGGER trg_attribute_order
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.attribute_order();

-- Realtime for live campaign performance updates.
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_events;