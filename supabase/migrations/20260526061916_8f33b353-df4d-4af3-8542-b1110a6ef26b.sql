
CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text,
  status text NOT NULL DEFAULT 'subscribed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can subscribe"
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "admins view subscribers"
  ON public.newsletter_subscribers FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update subscribers"
  ON public.newsletter_subscribers FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete subscribers"
  ON public.newsletter_subscribers FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_newsletter_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
