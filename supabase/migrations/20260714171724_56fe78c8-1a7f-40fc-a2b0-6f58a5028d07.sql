
-- Settings singleton (id='global' + optional per-category rows)
CREATE TABLE public.image_intelligence_settings (
  id text PRIMARY KEY,
  scope_kind text NOT NULL DEFAULT 'global' CHECK (scope_kind IN ('global','category','vendor')),
  scope_key text,
  mode text NOT NULL DEFAULT 'analyze_recommend'
    CHECK (mode IN ('off','analyze_only','analyze_recommend','analyze_normalize')),
  target_occupancy_min numeric NOT NULL DEFAULT 0.70,
  target_occupancy_max numeric NOT NULL DEFAULT 0.85,
  min_resolution int NOT NULL DEFAULT 800,
  allow_background_expansion boolean NOT NULL DEFAULT true,
  block_publish_on_low_quality boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_intelligence_settings TO authenticated;
GRANT ALL ON public.image_intelligence_settings TO service_role;

ALTER TABLE public.image_intelligence_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read image intel settings"
  ON public.image_intelligence_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff write image intel settings"
  ON public.image_intelligence_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Analysis jobs (audit trail — every analyze call gets one row)
CREATE TABLE public.image_intelligence_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  product_slug text,
  category_slug text,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'analyzed'
    CHECK (status IN ('analyzed','skipped','failed')),
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation jsonb,
  health_score int,
  duration_ms int,
  error_message text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.image_intelligence_jobs (product_slug, created_at DESC);
CREATE INDEX ON public.image_intelligence_jobs (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_intelligence_jobs TO authenticated;
GRANT ALL ON public.image_intelligence_jobs TO service_role;

ALTER TABLE public.image_intelligence_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read image intel jobs"
  ON public.image_intelligence_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Staff write image intel jobs"
  ON public.image_intelligence_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));

-- Extend product_images with intelligence fields (never mutate `url` = current display source)
ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS original_url text,
  ADD COLUMN IF NOT EXISTS optimized_url text,
  ADD COLUMN IF NOT EXISTS analysis_json jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Backfill original_url = url so the original is always preserved
UPDATE public.product_images SET original_url = url WHERE original_url IS NULL;

-- Seed the global settings row (idempotent)
INSERT INTO public.image_intelligence_settings (id, scope_kind, mode)
VALUES ('global','global','analyze_recommend')
ON CONFLICT (id) DO NOTHING;
