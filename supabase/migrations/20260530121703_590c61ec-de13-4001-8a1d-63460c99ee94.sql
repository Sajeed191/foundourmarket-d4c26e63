-- =========================================================
-- DORMANT MULTI-VENDOR MARKETPLACE ARCHITECTURE
-- Super-admin only. Disabled by default.
-- =========================================================

-- 1) Marketplace global settings (singleton switch)
CREATE TABLE public.marketplace_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  default_commission_rate numeric(5,2) NOT NULL DEFAULT 15.00,
  min_payout_amount numeric(12,2) NOT NULL DEFAULT 1000.00,
  payout_currency text NOT NULL DEFAULT 'INR',
  auto_approve_vendors boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_settings TO authenticated;
GRANT ALL ON public.marketplace_settings TO service_role;

ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access marketplace_settings"
ON public.marketplace_settings FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_marketplace_settings_updated
BEFORE UPDATE ON public.marketplace_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- seed single dormant row
INSERT INTO public.marketplace_settings (enabled) VALUES (false);

-- 2) Vendors
CREATE TABLE public.vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid,
  business_name text NOT NULL,
  slug text UNIQUE,
  contact_email text,
  contact_phone text,
  country text,
  status text NOT NULL DEFAULT 'pending',
  commission_rate numeric(5,2),
  logo_url text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_status ON public.vendors(status);
CREATE INDEX idx_vendors_owner ON public.vendors(owner_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access vendors"
ON public.vendors FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_vendors_updated
BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- status validation (no CHECK constraint per guidelines)
CREATE OR REPLACE FUNCTION public.validate_vendor_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending','active','suspended','rejected','archived') THEN
    RAISE EXCEPTION 'invalid vendor status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_vendors_validate
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.validate_vendor_status();

-- 3) Vendor products (link to existing products by slug)
CREATE TABLE public.vendor_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  vendor_sku text,
  vendor_price numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, product_slug)
);
CREATE INDEX idx_vendor_products_vendor ON public.vendor_products(vendor_id);
CREATE INDEX idx_vendor_products_slug ON public.vendor_products(product_slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_products TO authenticated;
GRANT ALL ON public.vendor_products TO service_role;

ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access vendor_products"
ON public.vendor_products FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_vendor_products_updated
BEFORE UPDATE ON public.vendor_products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Vendor analytics (daily snapshots)
CREATE TABLE public.vendor_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  day date NOT NULL,
  orders integer NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  commission numeric(14,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, day)
);
CREATE INDEX idx_vendor_analytics_vendor ON public.vendor_analytics(vendor_id);
CREATE INDEX idx_vendor_analytics_day ON public.vendor_analytics(day);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_analytics TO authenticated;
GRANT ALL ON public.vendor_analytics TO service_role;

ALTER TABLE public.vendor_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access vendor_analytics"
ON public.vendor_analytics FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 5) Vendor commissions
CREATE TABLE public.vendor_commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  order_id uuid,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  rate numeric(5,2),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending',
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_commissions_vendor ON public.vendor_commissions(vendor_id);
CREATE INDEX idx_vendor_commissions_status ON public.vendor_commissions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_commissions TO authenticated;
GRANT ALL ON public.vendor_commissions TO service_role;

ALTER TABLE public.vendor_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access vendor_commissions"
ON public.vendor_commissions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_vendor_commissions_updated
BEFORE UPDATE ON public.vendor_commissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Vendor payouts
CREATE TABLE public.vendor_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending',
  method text,
  reference text,
  period_start date,
  period_end date,
  processed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_payouts_vendor ON public.vendor_payouts(vendor_id);
CREATE INDEX idx_vendor_payouts_status ON public.vendor_payouts(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_payouts TO authenticated;
GRANT ALL ON public.vendor_payouts TO service_role;

ALTER TABLE public.vendor_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access vendor_payouts"
ON public.vendor_payouts FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_vendor_payouts_updated
BEFORE UPDATE ON public.vendor_payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Vendor support tickets
CREATE TABLE public.vendor_support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_support_vendor ON public.vendor_support_tickets(vendor_id);
CREATE INDEX idx_vendor_support_status ON public.vendor_support_tickets(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_support_tickets TO authenticated;
GRANT ALL ON public.vendor_support_tickets TO service_role;

ALTER TABLE public.vendor_support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin full access vendor_support_tickets"
ON public.vendor_support_tickets FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_vendor_support_updated
BEFORE UPDATE ON public.vendor_support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();