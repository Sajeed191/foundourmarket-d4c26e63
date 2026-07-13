-- Priority 3: business rules
CREATE TABLE public.recommendation_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_kind    text NOT NULL CHECK (rule_kind IN ('boost','reduce','exclude')),
  target_type  text NOT NULL CHECK (target_type IN
    ('new_arrivals','high_margin','fast_shipping','local_seller','featured','sustainable',
     'low_inventory','poor_reviews','high_returns','slow_delivery','brand','category','product','seller')),
  target_value text,
  weight       numeric NOT NULL DEFAULT 1,
  priority     integer NOT NULL DEFAULT 0,
  enabled      boolean NOT NULL DEFAULT true,
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_rules TO authenticated;
GRANT ALL ON public.recommendation_rules TO service_role;
ALTER TABLE public.recommendation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules read enabled" ON public.recommendation_rules FOR SELECT USING (enabled = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "rules admin write" ON public.recommendation_rules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_recommendation_rules_updated BEFORE UPDATE ON public.recommendation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Priority 4: experiments
CREATE TABLE public.recommendation_experiments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  description   text,
  variants      jsonb NOT NULL DEFAULT '[]'::jsonb,
  traffic_split jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
  winner        text,
  metrics       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.recommendation_experiments TO anon, authenticated;
GRANT ALL ON public.recommendation_experiments TO service_role;
ALTER TABLE public.recommendation_experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "experiments read running" ON public.recommendation_experiments FOR SELECT
  USING (status = 'running' OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "experiments admin write" ON public.recommendation_experiments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_recommendation_experiments_updated BEFORE UPDATE ON public.recommendation_experiments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.experiment_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id      text NOT NULL,
  user_id         uuid,
  experiment_key  text NOT NULL,
  variant         text NOT NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visitor_id, experiment_key)
);
CREATE INDEX idx_experiment_assignments_key ON public.experiment_assignments (experiment_key, variant);
GRANT SELECT, INSERT ON public.experiment_assignments TO anon, authenticated;
GRANT ALL ON public.experiment_assignments TO service_role;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments insert" ON public.experiment_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "assignments read own or admin" ON public.experiment_assignments FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR (user_id IS NOT NULL AND auth.uid() = user_id));