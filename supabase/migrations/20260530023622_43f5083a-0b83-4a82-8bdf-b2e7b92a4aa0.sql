CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.homepage_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  eyebrow text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.homepage_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT ALL ON public.homepage_sections TO service_role;

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homepage sections public read"
ON public.homepage_sections FOR SELECT USING (true);

CREATE POLICY "admins insert homepage sections"
ON public.homepage_sections FOR INSERT
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE POLICY "admins update homepage sections"
ON public.homepage_sections FOR UPDATE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE POLICY "admins delete homepage sections"
ON public.homepage_sections FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE TRIGGER update_homepage_sections_updated_at
BEFORE UPDATE ON public.homepage_sections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.homepage_sections (key, eyebrow, title) VALUES
  ('trending', 'Hot Right Now', 'Trending Products'),
  ('recommended', 'Curated For You', 'Recommended Products'),
  ('new_arrivals', 'Just Landed', 'New Arrivals');

ALTER PUBLICATION supabase_realtime ADD TABLE public.homepage_sections;