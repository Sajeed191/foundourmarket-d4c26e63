CREATE OR REPLACE FUNCTION public.notify_staff_new_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'review',
    'New product review',
    'A customer left a ' || NEW.rating || '★ review on ' || NEW.product_slug,
    '/products/' || NEW.product_slug || '#reviews',
    jsonb_build_object('review_id', NEW.id, 'product_slug', NEW.product_slug, 'rating', NEW.rating)
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_staff_new_question()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.notify_roles(
    ARRAY['admin','super_admin','manager','support']::app_role[],
    'question',
    'New product question',
    'A customer asked a question on ' || NEW.product_slug,
    '/products/' || NEW.product_slug || '#questions',
    jsonb_build_object('question_id', NEW.id, 'product_slug', NEW.product_slug)
  );
  RETURN NEW;
END $$;