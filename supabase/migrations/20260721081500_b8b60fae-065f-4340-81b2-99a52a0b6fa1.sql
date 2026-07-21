
-- ==========================================================================
-- Product Q&A v1.0 — full thread system
-- Extends product_questions with public visibility, anonymous flag, status,
-- details. Adds product_answers (multi-answer, 1-level replies, official flag)
-- and product_answer_votes (helpful votes, one per user).
-- ==========================================================================

-- 1) Extend product_questions --------------------------------------------------
ALTER TABLE public.product_questions
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible','hidden','deleted')),
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS details text;

-- Public read for visible, non-deleted questions
DROP POLICY IF EXISTS "public read visible questions" ON public.product_questions;
CREATE POLICY "public read visible questions"
  ON public.product_questions FOR SELECT
  USING (status = 'visible' AND deleted_at IS NULL);

GRANT SELECT ON public.product_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_questions TO authenticated;
GRANT ALL ON public.product_questions TO service_role;

-- 2) product_answers ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.product_questions(id) ON DELETE CASCADE,
  parent_answer_id uuid REFERENCES public.product_answers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_official boolean NOT NULL DEFAULT false,
  is_store_response boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  helpful_count integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_answers_question_idx
  ON public.product_answers (question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_answers_parent_idx
  ON public.product_answers (parent_answer_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_answers_one_official_per_q
  ON public.product_answers (question_id) WHERE is_official = true;

GRANT SELECT ON public.product_answers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_answers TO authenticated;
GRANT ALL ON public.product_answers TO service_role;

ALTER TABLE public.product_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read visible answers"
  ON public.product_answers FOR SELECT
  USING (status = 'visible' AND deleted_at IS NULL);

CREATE POLICY "staff read all answers"
  ON public.product_answers FOR SELECT
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "own answer insert"
  ON public.product_answers FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_official = false AND is_store_response = false);

CREATE POLICY "staff answer insert"
  ON public.product_answers FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "own answer update"
  ON public.product_answers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "staff answer update"
  ON public.product_answers FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE POLICY "own answer delete"
  ON public.product_answers FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "staff answer delete"
  ON public.product_answers FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

CREATE TRIGGER product_answers_updated_at
  BEFORE UPDATE ON public.product_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Guard: only staff can flip is_official / is_store_response
CREATE OR REPLACE FUNCTION public.guard_product_answer_flags()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  is_staff boolean;
BEGIN
  is_staff := public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]);
  IF is_staff THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_official := false;
    NEW.is_store_response := false;
    RETURN NEW;
  END IF;

  IF NEW.is_official IS DISTINCT FROM OLD.is_official
     OR NEW.is_store_response IS DISTINCT FROM OLD.is_store_response THEN
    RAISE EXCEPTION 'Only staff can modify official/store-response flags';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_product_answer_flags
  BEFORE INSERT OR UPDATE ON public.product_answers
  FOR EACH ROW EXECUTE FUNCTION public.guard_product_answer_flags();

-- 3) product_answer_votes -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_answer_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL REFERENCES public.product_answers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (answer_id, user_id)
);

CREATE INDEX IF NOT EXISTS product_answer_votes_user_idx
  ON public.product_answer_votes (user_id);

GRANT SELECT, INSERT, DELETE ON public.product_answer_votes TO authenticated;
GRANT ALL ON public.product_answer_votes TO service_role;

ALTER TABLE public.product_answer_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own vote select"
  ON public.product_answer_votes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "own vote insert"
  ON public.product_answer_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own vote delete"
  ON public.product_answer_votes FOR DELETE
  USING (auth.uid() = user_id);

-- 4) RPCs ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_answer_helpful(_answer_id uuid)
RETURNS TABLE (helpful_count integer, voted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  existing uuid;
  new_count integer;
  did_vote boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO existing FROM public.product_answer_votes
    WHERE answer_id = _answer_id AND user_id = uid;

  IF existing IS NOT NULL THEN
    DELETE FROM public.product_answer_votes WHERE id = existing;
    UPDATE public.product_answers SET helpful_count = GREATEST(0, helpful_count - 1)
      WHERE id = _answer_id RETURNING helpful_count INTO new_count;
    did_vote := false;
  ELSE
    INSERT INTO public.product_answer_votes (answer_id, user_id) VALUES (_answer_id, uid);
    UPDATE public.product_answers SET helpful_count = helpful_count + 1
      WHERE id = _answer_id RETURNING helpful_count INTO new_count;
    did_vote := true;
  END IF;

  RETURN QUERY SELECT COALESCE(new_count, 0), did_vote;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_answer_helpful(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_official_answer(_question_id uuid, _answer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.product_answers SET is_official = false
    WHERE question_id = _question_id AND is_official = true AND id <> _answer_id;
  IF _answer_id IS NOT NULL THEN
    UPDATE public.product_answers SET is_official = true
      WHERE id = _answer_id AND question_id = _question_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_official_answer(uuid, uuid) TO authenticated;

-- 5) Realtime -----------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_answers;
