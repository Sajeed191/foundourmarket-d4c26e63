ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS alt_phone text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS timezone text;