
-- Normalize existing rows first (preserves any product_badges assignments on renames)
UPDATE public.badge_types SET badge_key = 'bestseller', label = 'Bestseller' WHERE badge_key = 'best-seller';
UPDATE public.badge_types SET badge_key = 'flash_deal', label = 'Flash Deal' WHERE badge_key = 'flash_sale';

-- Remove legacy badge types (product_badges rows cascade)
DELETE FROM public.badge_types WHERE badge_key IN ('fast_selling', 'editors_choice', 'premium', 'limited_stock', 'featured', 'staff_pick', 'gift_idea');

-- Upsert the 8 canonical Badge System v4 badges with priorities and default colors
INSERT INTO public.badge_types (badge_key, label, priority, color, text_color, background_color, border_color, glow_color, radius, font_size, font_weight, animation, category, enabled, archived, emoji, description)
VALUES
  ('flash_deal',  'Flash Deal',  95, '#ff5a1f', '#ffffff', '#ff5a1f', '#ff7a3d', '#ff5a1f', 6, 11, 700, 'flash', 'Sales',     true, false, '⚡', 'Time-limited flash promotion'),
  ('hot_deal',    'Hot Deal',    90, '#e63946', '#ffffff', '#e63946', '#ff5252', '#e63946', 6, 11, 700, 'pulse', 'Sales',     true, false, '🔥', 'High-discount hot deal'),
  ('bestseller',  'Bestseller',  85, '#f5b301', '#0a0a0a', '#f5b301', '#f7c948', '#f5b301', 6, 11, 700, 'shine', 'Trending',  true, false, '⭐', 'Top-selling product'),
  ('trending',    'Trending',    80, '#2563eb', '#ffffff', '#2563eb', '#3b82f6', '#2563eb', 6, 11, 700, 'glow',  'Trending',  true, false, '📈', 'Rising in demand'),
  ('new',         'New',         70, '#10b981', '#ffffff', '#10b981', '#34d399', '#10b981', 6, 11, 700, 'none',  'Marketing', true, false, '🆕', 'Recently added'),
  ('recommended', 'Recommended', 60, '#6366f1', '#ffffff', '#6366f1', '#818cf8', '#6366f1', 6, 11, 700, 'none',  'Marketing', true, false, '✨', 'AI-recommended for you'),
  ('best_value',  'Best Value',  50, '#8b5cf6', '#ffffff', '#8b5cf6', '#a78bfa', '#8b5cf6', 6, 11, 700, 'none',  'Marketing', true, false, '💎', 'Best price for quality'),
  ('popular',     'Popular',     40, '#0ea5a4', '#ffffff', '#0ea5a4', '#14b8a6', '#0ea5a4', 6, 11, 700, 'none',  'Trending',  true, false, '👥', 'Loved by many buyers')
ON CONFLICT (badge_key) DO UPDATE SET
  label = EXCLUDED.label,
  priority = EXCLUDED.priority,
  color = EXCLUDED.color,
  text_color = EXCLUDED.text_color,
  background_color = EXCLUDED.background_color,
  border_color = EXCLUDED.border_color,
  glow_color = EXCLUDED.glow_color,
  radius = EXCLUDED.radius,
  font_size = EXCLUDED.font_size,
  font_weight = EXCLUDED.font_weight,
  animation = EXCLUDED.animation,
  category = EXCLUDED.category,
  enabled = true,
  archived = false,
  updated_at = now();

-- Remove any remaining rows outside the canonical 8
DELETE FROM public.badge_types WHERE badge_key NOT IN ('flash_deal','hot_deal','bestseller','trending','new','recommended','best_value','popular');
