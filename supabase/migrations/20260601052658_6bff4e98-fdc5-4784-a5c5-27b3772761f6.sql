ALTER TABLE public.product_badges
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_product_badges_slug ON public.product_badges(product_slug);
CREATE INDEX IF NOT EXISTS idx_product_badges_type ON public.product_badges(badge_type_id);