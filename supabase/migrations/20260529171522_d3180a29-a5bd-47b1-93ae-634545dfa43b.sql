-- 1. Announcements table
CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'sparkles',
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  cta_text TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  countdown_to TIMESTAMP WITH TIME ZONE,
  region TEXT NOT NULL DEFAULT 'all',
  pages TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active announcements public"
ON public.announcements FOR SELECT
USING (
  active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())
);

CREATE POLICY "editors view all announcements"
ON public.announcements FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "editors insert announcements"
ON public.announcements FOR INSERT
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "editors update announcements"
ON public.announcements FOR UPDATE
USING (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "editors delete announcements"
ON public.announcements FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE TRIGGER trg_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_announcements_active_sort ON public.announcements (active, sort_order);

ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;

-- 2. Banner upgrades for live targeting / responsive artwork
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS pages TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mobile_image TEXT;

-- 3. Seed a few announcements from the previous hardcoded copy
INSERT INTO public.announcements (message, icon, type, sort_order) VALUES
  ('Free worldwide shipping on orders over $50', 'truck', 'shipping', 10),
  ('Buyer protection · Encrypted checkout', 'shield', 'info', 20),
  ('New arrivals just landed — fresh drops daily', 'sparkles', 'info', 30),
  ('Flash deals live · Limited stock', 'flame', 'sale', 40),
  ('Trusted by shoppers in 180+ countries', 'globe', 'info', 50);