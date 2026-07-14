
ALTER TABLE public.image_intelligence_jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'analyze',
  ADD COLUMN IF NOT EXISTS actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS optimized_url text,
  ADD COLUMN IF NOT EXISTS image_id uuid;

CREATE INDEX IF NOT EXISTS idx_intel_jobs_status ON public.image_intelligence_jobs(status, job_type, created_at DESC);

ALTER TABLE public.image_intelligence_settings
  ADD COLUMN IF NOT EXISTS auto_apply_safe boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS optimized_meta jsonb,
  ADD COLUMN IF NOT EXISTS optimization_actions jsonb,
  ADD COLUMN IF NOT EXISTS optimization_applied_at timestamptz;
