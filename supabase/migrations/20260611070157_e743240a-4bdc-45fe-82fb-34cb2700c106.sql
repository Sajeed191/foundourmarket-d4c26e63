CREATE TABLE public.rotation_state (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  nonce BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT rotation_state_singleton CHECK (id = true)
);

GRANT SELECT ON public.rotation_state TO anon, authenticated;
GRANT ALL ON public.rotation_state TO service_role;

ALTER TABLE public.rotation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rotation state"
  ON public.rotation_state FOR SELECT
  USING (true);

CREATE POLICY "Admins can update rotation state"
  ON public.rotation_state FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.rotation_state (id, nonce) VALUES (true, 0);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rotation_state;