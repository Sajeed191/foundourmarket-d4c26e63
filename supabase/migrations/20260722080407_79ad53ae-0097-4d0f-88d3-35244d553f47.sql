-- Backfill: resync products.rating & products.reviews from source of truth
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT slug FROM public.products LOOP
    PERFORM public.recalculate_product_rating(r.slug);
  END LOOP;
END $$;