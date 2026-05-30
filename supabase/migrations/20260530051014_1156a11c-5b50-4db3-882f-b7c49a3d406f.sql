-- 1. Aggregate tally columns on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wishlist_count integer NOT NULL DEFAULT 0;

-- Backfill sold_count from order_items
UPDATE public.products p
SET sold_count = COALESCE(agg.qty, 0)
FROM (
  SELECT product_slug, SUM(quantity)::int AS qty
  FROM public.order_items GROUP BY product_slug
) agg
WHERE p.slug = agg.product_slug;

-- Backfill wishlist_count
UPDATE public.products p
SET wishlist_count = COALESCE(agg.cnt, 0)
FROM (
  SELECT product_slug, COUNT(*)::int AS cnt
  FROM public.wishlist GROUP BY product_slug
) agg
WHERE p.slug = agg.product_slug;

-- 2. Triggers to keep tallies current
CREATE OR REPLACE FUNCTION public.bump_sold_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.products SET sold_count = sold_count + NEW.quantity WHERE slug = NEW.product_slug;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bump_sold_count ON public.order_items;
CREATE TRIGGER trg_bump_sold_count
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.bump_sold_count();

CREATE OR REPLACE FUNCTION public.bump_wishlist_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products SET wishlist_count = wishlist_count + 1 WHERE slug = NEW.product_slug;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products SET wishlist_count = GREATEST(0, wishlist_count - 1) WHERE slug = OLD.product_slug;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_bump_wishlist_count ON public.wishlist;
CREATE TRIGGER trg_bump_wishlist_count
AFTER INSERT OR DELETE ON public.wishlist
FOR EACH ROW EXECUTE FUNCTION public.bump_wishlist_count();

-- 3. Admin-configurable badge settings (single row)
CREATE TABLE public.badge_settings (
  id boolean PRIMARY KEY DEFAULT true,
  trending_enabled boolean NOT NULL DEFAULT true,
  trending_views_min integer NOT NULL DEFAULT 200,
  trending_wishlist_min integer NOT NULL DEFAULT 15,
  bestseller_enabled boolean NOT NULL DEFAULT true,
  bestseller_sales_min integer NOT NULL DEFAULT 50,
  fast_selling_enabled boolean NOT NULL DEFAULT true,
  fast_selling_per_day_min numeric NOT NULL DEFAULT 3,
  limited_stock_enabled boolean NOT NULL DEFAULT true,
  limited_stock_max integer NOT NULL DEFAULT 5,
  new_arrival_enabled boolean NOT NULL DEFAULT true,
  new_arrival_days integer NOT NULL DEFAULT 14,
  hot_deal_enabled boolean NOT NULL DEFAULT true,
  hot_deal_discount_min integer NOT NULL DEFAULT 20,
  max_badges integer NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT badge_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.badge_settings TO anon, authenticated;
GRANT ALL ON public.badge_settings TO service_role;

ALTER TABLE public.badge_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badge settings readable by everyone"
ON public.badge_settings FOR SELECT USING (true);

CREATE POLICY "Staff can insert badge settings"
ON public.badge_settings FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

CREATE POLICY "Staff can update badge settings"
ON public.badge_settings FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[]));

CREATE TRIGGER trg_badge_settings_updated_at
BEFORE UPDATE ON public.badge_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the singleton row
INSERT INTO public.badge_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;