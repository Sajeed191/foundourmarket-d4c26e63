
DO $$
DECLARE
  r RECORD;
  new_rating NUMERIC(2,1);
BEGIN
  FOR r IN
    SELECT id, slug FROM public.products
    WHERE COALESCE(initial_rating,0) = 0
      AND COALESCE(rating,0) = 0
      AND COALESCE(reviews,0) = 0
  LOOP
    new_rating := ROUND((4.2 + random() * 0.4)::numeric, 1);
    UPDATE public.products SET initial_rating = new_rating WHERE id = r.id;

    BEGIN
      PERFORM public.recalculate_product_rating(r.slug);
    EXCEPTION WHEN undefined_function THEN
      UPDATE public.products SET rating = new_rating WHERE id = r.id AND reviews = 0;
    END;

    INSERT INTO public.product_rating_audit
      (product_slug, action, initial_rating, rating_source, final_rating, total_reviews, metadata)
    VALUES
      (r.slug, 'bulk_recovery_v1', new_rating, 'initial_rating', new_rating, 0,
       jsonb_build_object('source','bulk_recovery_v1','range','4.2-4.6'));
  END LOOP;
END $$;
