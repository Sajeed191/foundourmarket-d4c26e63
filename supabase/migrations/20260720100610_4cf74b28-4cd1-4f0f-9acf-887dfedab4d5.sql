
CREATE TABLE IF NOT EXISTS public.site_rules (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.site_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_rules TO authenticated;
GRANT ALL ON public.site_rules TO service_role;

ALTER TABLE public.site_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_rules public read"
  ON public.site_rules FOR SELECT
  USING (true);

CREATE POLICY "site_rules admin insert"
  ON public.site_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "site_rules admin update"
  ON public.site_rules FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "site_rules admin delete"
  ON public.site_rules FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.site_rules_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_rules_touch ON public.site_rules;
CREATE TRIGGER trg_site_rules_touch
  BEFORE INSERT OR UPDATE ON public.site_rules
  FOR EACH ROW EXECUTE FUNCTION public.site_rules_touch();

-- Enable realtime so admin changes propagate to every open storefront tab.
ALTER TABLE public.site_rules REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'site_rules'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.site_rules';
  END IF;
END $$;

-- Seed the Homepage Collections rule with defaults (only if not present).
INSERT INTO public.site_rules (key, value)
VALUES (
  'homepage_collections',
  jsonb_build_object(
    'limits', jsonb_build_object(
      'flash_deals', 10,
      'trending', 50,
      'best_sellers', 50,
      'new_arrivals', 50,
      'featured', 50
    ),
    'rotationHours', 2,
    'reshuffleTimesIst', jsonb_build_array('06:00','12:00','18:00','00:00'),
    'reshuffleEnabled', true
  )
)
ON CONFLICT (key) DO NOTHING;
