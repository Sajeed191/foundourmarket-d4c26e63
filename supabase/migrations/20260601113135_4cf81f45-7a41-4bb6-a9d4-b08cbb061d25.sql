ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS support_status text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS support_response_minutes integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS support_whatsapp_numbers text[] NOT NULL DEFAULT ARRAY['+91 97458 44213','+91 62820 88380','+91 87144 59240']::text[];

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_support_status_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_support_status_check
  CHECK (support_status = ANY (ARRAY['auto'::text, 'online'::text, 'high_volume'::text]));