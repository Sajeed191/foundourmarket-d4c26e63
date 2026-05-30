CREATE TABLE public.testimonials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote text NOT NULL,
  name text NOT NULL,
  role text,
  country text,
  flag text,
  rating integer NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.testimonials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active testimonials public"
ON public.testimonials FOR SELECT
USING (active = true);

CREATE POLICY "staff view all testimonials"
ON public.testimonials FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE POLICY "staff insert testimonials"
ON public.testimonials FOR INSERT
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE POLICY "staff update testimonials"
ON public.testimonials FOR UPDATE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE POLICY "staff delete testimonials"
ON public.testimonials FOR DELETE
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'editor'::app_role]));

CREATE TRIGGER update_testimonials_updated_at
BEFORE UPDATE ON public.testimonials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.testimonials (quote, name, role, country, flag, rating, sort_order) VALUES
('Completely redefined how I source premium goods. The quality is unmatched.', 'Marcus Thorne', 'Curator', 'United Kingdom', '🇬🇧', 5, 0),
('Fast shipping, gorgeous packaging, and every item felt hand-picked for me.', 'Ayaka Mori', 'Designer', 'Japan', '🇯🇵', 5, 1),
('The best support I''ve dealt with from any online store, full stop.', 'Diego Alvarez', 'Founder', 'Spain', '🇪🇸', 5, 2);