ALTER TABLE public.badge_types
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Custom',
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS font_size integer NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS font_weight integer NOT NULL DEFAULT 700,
  ADD COLUMN IF NOT EXISTS animation text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_badge_types_category ON public.badge_types (category);
CREATE INDEX IF NOT EXISTS idx_badge_types_archived ON public.badge_types (archived);