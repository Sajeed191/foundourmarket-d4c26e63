-- 1. Badge catalog (admin-managed styles)
CREATE TABLE public.badge_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  badge_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#f59e0b',
  text_color TEXT NOT NULL DEFAULT '#0a0a0a',
  emoji TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  is_discount BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.badge_types TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badge_types TO authenticated;
GRANT ALL ON public.badge_types TO service_role;

ALTER TABLE public.badge_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Badge types readable by everyone"
ON public.badge_types FOR SELECT USING (true);

CREATE POLICY "Staff manage badge types insert"
ON public.badge_types FOR INSERT TO authenticated
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Staff manage badge types update"
ON public.badge_types FOR UPDATE TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Staff manage badge types delete"
ON public.badge_types FOR DELETE TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

-- 2. Per-product badge assignments (keyed by product slug)
CREATE TABLE public.product_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_slug TEXT NOT NULL,
  badge_type_id UUID NOT NULL REFERENCES public.badge_types(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (product_slug, badge_type_id)
);

CREATE INDEX idx_product_badges_slug ON public.product_badges(product_slug);

GRANT SELECT ON public.product_badges TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_badges TO authenticated;
GRANT ALL ON public.product_badges TO service_role;

ALTER TABLE public.product_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product badges readable by everyone"
ON public.product_badges FOR SELECT USING (true);

CREATE POLICY "Staff manage product badges insert"
ON public.product_badges FOR INSERT TO authenticated
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Staff manage product badges update"
ON public.product_badges FOR UPDATE TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

CREATE POLICY "Staff manage product badges delete"
ON public.product_badges FOR DELETE TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

-- 3. updated_at trigger for badge_types
CREATE TRIGGER update_badge_types_updated_at
BEFORE UPDATE ON public.badge_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Seed the supported badge catalog
INSERT INTO public.badge_types (badge_key, label, color, text_color, emoji, priority, is_discount) VALUES
  ('best_seller',    'Best Seller',    '#fbbf24', '#0a0a0a', '⭐', 100, false),
  ('hot_deal',       'Hot Deal',       '#ef4444', '#ffffff', '🔥', 95,  false),
  ('flash_sale',     'Flash Sale',     '#dc2626', '#ffffff', '⚡', 90,  false),
  ('trending',       'Trending',       '#f97316', '#0a0a0a', '🔥', 85,  false),
  ('fast_selling',   'Fast Selling',   '#d946ef', '#ffffff', '⚡', 80,  false),
  ('editors_choice', 'Editor''s Choice','#8b5cf6', '#ffffff', '🏆', 75, false),
  ('recommended',    'Recommended',    '#3b82f6', '#ffffff', '👍', 70,  false),
  ('premium',        'Premium',        '#0f172a', '#fbbf24', '💎', 65,  false),
  ('limited_stock',  'Limited Stock',  '#ea580c', '#ffffff', '⚠️', 60,  false),
  ('new',            'New',            '#10b981', '#ffffff', '🆕', 55,  false);