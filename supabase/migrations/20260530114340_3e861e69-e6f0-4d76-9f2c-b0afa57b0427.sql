-- Outcome tracking columns for executed recommendations
ALTER TABLE public.ai_recommendations
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revenue_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS profit_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS conversion_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS inventory_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS customer_impact NUMERIC,
  ADD COLUMN IF NOT EXISTS success_score INTEGER;

-- Feedback loop: admins vote on recommendation usefulness
CREATE TABLE IF NOT EXISTS public.ai_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_key TEXT NOT NULL,
  vote TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rec_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_rec ON public.ai_recommendation_feedback(rec_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_recommendation_feedback TO authenticated;
GRANT ALL ON public.ai_recommendation_feedback TO service_role;

ALTER TABLE public.ai_recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read ai feedback" ON public.ai_recommendation_feedback
  FOR SELECT USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));
CREATE POLICY "Staff insert ai feedback" ON public.ai_recommendation_feedback
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]) AND auth.uid() = user_id);
CREATE POLICY "Staff update own ai feedback" ON public.ai_recommendation_feedback
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Staff delete own ai feedback" ON public.ai_recommendation_feedback
  FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_recommendation_feedback;
ALTER TABLE public.ai_recommendation_feedback REPLICA IDENTITY FULL;