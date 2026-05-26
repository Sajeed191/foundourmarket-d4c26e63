CREATE TABLE public.product_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer text,
  answered_by uuid,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_questions_slug_idx ON public.product_questions(product_slug, created_at DESC);

ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions viewable by everyone" ON public.product_questions
  FOR SELECT USING (true);

CREATE POLICY "own question insert" ON public.product_questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own question update" ON public.product_questions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "admins update any question" ON public.product_questions
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "own question delete" ON public.product_questions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "admins delete any question" ON public.product_questions
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER product_questions_updated_at
  BEFORE UPDATE ON public.product_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();