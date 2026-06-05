
-- Guard: prevent non-staff from changing staff-controlled columns on product_questions
CREATE OR REPLACE FUNCTION public.protect_product_question_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]) THEN
    RETURN NEW;
  END IF;
  NEW.answer := OLD.answer;
  NEW.answered_by := OLD.answered_by;
  NEW.answered_at := OLD.answered_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_product_question_fields ON public.product_questions;
CREATE TRIGGER trg_protect_product_question_fields
BEFORE UPDATE ON public.product_questions
FOR EACH ROW EXECUTE FUNCTION public.protect_product_question_fields();

-- Guard: prevent non-staff from changing moderation/fraud columns on product_reviews
CREATE OR REPLACE FUNCTION public.protect_product_review_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]) THEN
    RETURN NEW;
  END IF;
  NEW.status := OLD.status;
  NEW.pinned := OLD.pinned;
  NEW.featured := OLD.featured;
  NEW.verified_purchase := OLD.verified_purchase;
  NEW.helpful_count := OLD.helpful_count;
  NEW.not_helpful_count := OLD.not_helpful_count;
  NEW.report_count := OLD.report_count;
  NEW.is_flagged := OLD.is_flagged;
  NEW.admin_reply := OLD.admin_reply;
  NEW.admin_reply_at := OLD.admin_reply_at;
  NEW.admin_reply_by := OLD.admin_reply_by;
  NEW.sentiment := OLD.sentiment;
  NEW.sentiment_score := OLD.sentiment_score;
  NEW.sentiment_summary := OLD.sentiment_summary;
  NEW.fake_score := OLD.fake_score;
  NEW.fake_reasons := OLD.fake_reasons;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_product_review_fields ON public.product_reviews;
CREATE TRIGGER trg_protect_product_review_fields
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.protect_product_review_fields();
