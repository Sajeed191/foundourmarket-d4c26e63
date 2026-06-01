ALTER TABLE public.badge_types
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background_color text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS border_color text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS glow_color text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon_color text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shadow_strength integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS radius integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_rule jsonb;

CREATE TABLE IF NOT EXISTS public.badge_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  badge_type_id uuid NOT NULL REFERENCES public.badge_types(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  event_type text NOT NULL DEFAULT 'click',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_badge_events_badge ON public.badge_events(badge_type_id);
CREATE INDEX IF NOT EXISTS idx_badge_events_created ON public.badge_events(created_at);

GRANT SELECT, INSERT ON public.badge_events TO anon;
GRANT SELECT, INSERT ON public.badge_events TO authenticated;
GRANT ALL ON public.badge_events TO service_role;

ALTER TABLE public.badge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record badge clicks"
ON public.badge_events FOR INSERT
WITH CHECK (true);

CREATE POLICY "Staff can read badge events"
ON public.badge_events FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.badge_events;