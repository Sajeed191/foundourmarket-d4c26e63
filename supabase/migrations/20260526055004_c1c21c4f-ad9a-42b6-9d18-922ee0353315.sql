CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  image text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories are viewable by everyone"
ON public.categories FOR SELECT USING (true);

CREATE POLICY "admins insert categories"
ON public.categories FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update categories"
ON public.categories FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete categories"
ON public.categories FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('electronics', 'Electronics', 1),
  ('fashion', 'Fashion', 2),
  ('home', 'Home', 3),
  ('beauty', 'Beauty', 4),
  ('fitness', 'Fitness', 5),
  ('gaming', 'Gaming', 6),
  ('accessories', 'Accessories', 7),
  ('gadgets', 'Gadgets', 8);