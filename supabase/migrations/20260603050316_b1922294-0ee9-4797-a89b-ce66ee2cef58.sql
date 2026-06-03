-- Flash Deals: per-product, scheduled, auto-expiring promotional pricing
CREATE TABLE public.flash_deals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  flash_price numeric NOT NULL CHECK (flash_price >= 0),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active deal per product (prevents duplicates)
CREATE UNIQUE INDEX flash_deals_one_active_per_product
  ON public.flash_deals (product_id) WHERE active = true;

CREATE INDEX flash_deals_window_idx ON public.flash_deals (active, start_at, end_at);

-- Grants
GRANT SELECT ON public.flash_deals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flash_deals TO authenticated;
GRANT ALL ON public.flash_deals TO service_role;

ALTER TABLE public.flash_deals ENABLE ROW LEVEL SECURITY;

-- Public can only read currently-live deals
CREATE POLICY "live flash deals public" ON public.flash_deals
  FOR SELECT
  USING (active = true AND start_at <= now() AND end_at >= now());

-- Managers see and manage everything
CREATE POLICY "managers view all flash deals" ON public.flash_deals
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));
CREATE POLICY "managers insert flash deals" ON public.flash_deals
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));
CREATE POLICY "managers update flash deals" ON public.flash_deals
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));
CREATE POLICY "managers delete flash deals" ON public.flash_deals
  FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

CREATE TRIGGER trg_flash_deals_updated_at
  BEFORE UPDATE ON public.flash_deals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.flash_deals;

-- Auto-expiration: deactivate deals whose window has ended
CREATE OR REPLACE FUNCTION public.expire_flash_deals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.flash_deals
  SET active = false
  WHERE active = true AND end_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Daily automatic refresh of flash deals (expire ended deals)
SELECT cron.schedule(
  'daily-flash-deal-refresh',
  '5 0 * * *',
  $$ SELECT public.expire_flash_deals(); $$
);