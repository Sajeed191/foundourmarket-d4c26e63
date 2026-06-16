DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'banners_public','cms_pages_public','cms_posts_public','frequently_bought_together',
    'payment_gateways_public','product_reviews_public','product_variants_public',
    'products_public','store_settings_public','trending_products'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', v);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', v);
  END LOOP;
END $$;