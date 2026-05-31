ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS shipping_mode text NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS free_shipping_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flat_shipping_inr numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flat_shipping_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_inr numeric,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_usd numeric;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS shipping_fee_inr numeric,
  ADD COLUMN IF NOT EXISTS shipping_fee_usd numeric,
  ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_shipping_mode_check;

ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_shipping_mode_check
  CHECK (shipping_mode IN ('free', 'flat', 'region', 'product', 'category'));

ALTER TABLE public.store_settings
  ALTER COLUMN shipping_mode SET DEFAULT 'product',
  ALTER COLUMN free_shipping_enabled SET DEFAULT false,
  ALTER COLUMN flat_shipping_inr SET DEFAULT 0,
  ALTER COLUMN flat_shipping_usd SET DEFAULT 0;

UPDATE public.store_settings
SET
  shipping_mode = COALESCE(NULLIF(shipping_mode, ''), 'product'),
  free_shipping_enabled = COALESCE(free_shipping_enabled, false),
  flat_shipping_inr = COALESCE(flat_shipping_inr, 0),
  flat_shipping_usd = COALESCE(flat_shipping_usd, 0)
WHERE id = true;