-- Extend addresses table with production-grade fields
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS address_type text NOT NULL DEFAULT 'home',
  ADD COLUMN IF NOT EXISTS alternate_phone text,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;

-- Validate address_type values via trigger (avoid immutable CHECK issues)
CREATE OR REPLACE FUNCTION public.validate_address_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.address_type NOT IN ('home','work','other') THEN
    RAISE EXCEPTION 'address_type must be home, work or other';
  END IF;
  IF NEW.use_count < 0 THEN
    NEW.use_count = 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_address_type ON public.addresses;
CREATE TRIGGER trg_validate_address_type
  BEFORE INSERT OR UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.validate_address_type();

-- updated_at trigger (reuse existing set_updated_at)
DROP TRIGGER IF EXISTS trg_addresses_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ensure single-default enforcement trigger is attached
DROP TRIGGER IF EXISTS trg_enforce_single_default_address ON public.addresses;
CREATE TRIGGER trg_enforce_single_default_address
  BEFORE INSERT OR UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_address();

-- Indexes for mobile search/filter
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_type ON public.addresses(user_id, address_type);
CREATE INDEX IF NOT EXISTS idx_addresses_last_used ON public.addresses(user_id, last_used_at DESC);

-- Realtime
ALTER TABLE public.addresses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.addresses;