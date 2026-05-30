CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'recommended',
  priority TEXT NOT NULL DEFAULT 'medium',
  affected_systems TEXT[] NOT NULL DEFAULT '{}',
  impact NUMERIC NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  reasoning TEXT,
  action_kind TEXT,
  deep_link TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  snooze_until TIMESTAMPTZ,
  assigned_to UUID,
  outcome TEXT,
  outcome_value NUMERIC,
  created_by UUID,
  acted_by UUID,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rec_status ON public.ai_recommendations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_rec_category ON public.ai_recommendations(category, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_recommendations TO authenticated;
GRANT ALL ON public.ai_recommendations TO service_role;

ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read ai recommendations" ON public.ai_recommendations
  FOR SELECT USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));
CREATE POLICY "Staff insert ai recommendations" ON public.ai_recommendations
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));
CREATE POLICY "Staff update ai recommendations" ON public.ai_recommendations
  FOR UPDATE USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));
CREATE POLICY "Staff delete ai recommendations" ON public.ai_recommendations
  FOR DELETE USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[]));

CREATE OR REPLACE FUNCTION public.set_updated_at_ai_rec()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ai_rec_updated_at ON public.ai_recommendations;
CREATE TRIGGER trg_ai_rec_updated_at
BEFORE UPDATE ON public.ai_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ai_rec();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_recommendations;
ALTER TABLE public.ai_recommendations REPLICA IDENTITY FULL;