ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS analysis jsonb,
  ADD COLUMN IF NOT EXISTS normalized_url text;