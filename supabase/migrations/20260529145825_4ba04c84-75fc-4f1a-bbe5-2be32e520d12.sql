-- ============ PRODUCTS: dual region pricing + visibility ============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_inr numeric,
  ADD COLUMN IF NOT EXISTS compare_price_inr numeric,
  ADD COLUMN IF NOT EXISTS price_usd numeric,
  ADD COLUMN IF NOT EXISTS compare_price_usd numeric,
  ADD COLUMN IF NOT EXISTS india_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS international_visible boolean NOT NULL DEFAULT true;

-- Seed from the legacy USD price (admin sets real independent prices later)
UPDATE public.products
  SET price_usd = COALESCE(price_usd, price),
      price_inr = COALESCE(price_inr, ROUND(price * 83)),
      compare_price_usd = COALESCE(
        compare_price_usd,
        CASE WHEN discount IS NOT NULL AND discount > 0
             THEN ROUND((price * (1 + discount / 100.0))::numeric, 2) END),
      compare_price_inr = COALESCE(
        compare_price_inr,
        CASE WHEN discount IS NOT NULL AND discount > 0
             THEN ROUND(price * 83 * (1 + discount / 100.0)) END)
  WHERE price_usd IS NULL OR price_inr IS NULL;

-- ============ PROFILES: region lock ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS market_region text,
  ADD COLUMN IF NOT EXISTS region_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS country_code text;

-- Validate allowed region values + permanently lock once assigned
CREATE OR REPLACE FUNCTION public.enforce_region_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.market_region IS NOT NULL
     AND NEW.market_region NOT IN ('india','international') THEN
    RAISE EXCEPTION 'market_region must be india or international';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Once locked, region can never change
    IF OLD.market_region IS NOT NULL
       AND NEW.market_region IS DISTINCT FROM OLD.market_region THEN
      RAISE EXCEPTION 'market_region is locked and cannot be changed';
    END IF;
    -- Stamp the lock time when first assigned
    IF OLD.market_region IS NULL AND NEW.market_region IS NOT NULL
       AND NEW.region_locked_at IS NULL THEN
      NEW.region_locked_at := now();
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.market_region IS NOT NULL AND NEW.region_locked_at IS NULL THEN
      NEW.region_locked_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_region_lock ON public.profiles;
CREATE TRIGGER trg_enforce_region_lock
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_region_lock();

-- ============ ORDERS: region + provider ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS market_region text,
  ADD COLUMN IF NOT EXISTS payment_provider text;