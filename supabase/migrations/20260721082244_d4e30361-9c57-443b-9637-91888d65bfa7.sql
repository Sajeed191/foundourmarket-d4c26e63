
-- 1. Remove the older, incorrect aggregate trigger and function that averaged
--    every row (including deleted / hidden / seeded reviews) back into the
--    product rating. Keeping two triggers meant the last one to fire won.
DROP TRIGGER IF EXISTS product_reviews_refresh_aggregate ON public.product_reviews;
DROP FUNCTION IF EXISTS public.refresh_product_rating(text);

-- 2. Rewrite the single source of truth. Rule (spec v3.0):
--      published_customer_reviews == 0  →  rating = initial_rating, reviews = 0
--      published_customer_reviews >= 1  →  rating = AVG(customer),  reviews = COUNT
--    Never mix admin rating with customer ratings.
--    "Published customer review" = status='published' AND deleted_at IS NULL
--                                  AND is_seeded = false.
CREATE OR REPLACE FUNCTION public.recalculate_product_rating(_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_initial_rating numeric;
  v_customer_count integer;
  v_customer_avg   numeric;
  v_final_rating   numeric;
  v_final_count    integer;
BEGIN
  SELECT COALESCE(initial_rating, 0)
    INTO v_initial_rating
  FROM public.products
  WHERE slug = _slug;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int, COALESCE(AVG(rating), 0)
    INTO v_customer_count, v_customer_avg
  FROM public.product_reviews
  WHERE product_slug = _slug
    AND status = 'published'
    AND deleted_at IS NULL
    AND COALESCE(is_seeded, false) = false;

  IF v_customer_count = 0 THEN
    v_final_rating := v_initial_rating;
    v_final_count  := 0;
  ELSE
    v_final_rating := v_customer_avg;
    v_final_count  := v_customer_count;
  END IF;

  UPDATE public.products
  SET rating     = ROUND(v_final_rating, 2),
      reviews    = v_final_count,
      updated_at = now()
  WHERE slug = _slug;
END;
$function$;

-- 3. Ensure the trigger that fires on every review insert / update / delete
--    still calls the (now-correct) single aggregate function. It already
--    exists as `recalc_product_rating` on public.product_reviews and calls
--    trg_recalc_product_rating(); no change needed. Reassert for safety.
DROP TRIGGER IF EXISTS recalc_product_rating ON public.product_reviews;
CREATE TRIGGER recalc_product_rating
AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_product_rating();

-- 4. Drop the orphaned helper trigger function used only by the removed
--    duplicate trigger, so it can't be re-attached by mistake.
DROP FUNCTION IF EXISTS public.on_review_change();

-- 5. Backfill: recompute every product using the new rule.
DO $$
DECLARE
  s text;
BEGIN
  FOR s IN SELECT slug FROM public.products LOOP
    PERFORM public.recalculate_product_rating(s);
  END LOOP;
END $$;
