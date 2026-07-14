
ALTER TABLE public.image_intelligence_jobs
  ADD COLUMN IF NOT EXISTS engine_version text,
  ADD COLUMN IF NOT EXISTS photon_version text,
  ADD COLUMN IF NOT EXISTS quality_gate_version text,
  ADD COLUMN IF NOT EXISTS category_rules_version text;

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS engine_version text,
  ADD COLUMN IF NOT EXISTS photon_version text,
  ADD COLUMN IF NOT EXISTS quality_gate_version text,
  ADD COLUMN IF NOT EXISTS category_rules_version text;
