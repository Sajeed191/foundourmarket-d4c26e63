CREATE OR REPLACE FUNCTION public.guard_product_question_answer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff may freely set/modify answer fields.
  IF has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]) THEN
    RETURN NEW;
  END IF;

  -- Non-staff must not change privileged answer columns.
  IF NEW.answer IS DISTINCT FROM OLD.answer
     OR NEW.answered_by IS DISTINCT FROM OLD.answered_by
     OR NEW.answered_at IS DISTINCT FROM OLD.answered_at THEN
    RAISE EXCEPTION 'Only staff may answer product questions';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_product_question_answer ON public.product_questions;
CREATE TRIGGER guard_product_question_answer
  BEFORE UPDATE ON public.product_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_question_answer();