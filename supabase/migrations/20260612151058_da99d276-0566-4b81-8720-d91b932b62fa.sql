-- ============================================================
-- Automated Product SEO System — generators, autofill trigger, public view
-- SEO-only. Does not touch checkout, orders or inventory logic.
-- ============================================================

-- Slugify helper
CREATE OR REPLACE FUNCTION public.fom_slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(p_text,'')), '[^a-z0-9]+', '-', 'g'));
$$;

-- SEO title: "{Name} | FoundOurMarket"
CREATE OR REPLACE FUNCTION public.fom_seo_title(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT left(coalesce(nullif(trim(p_name), ''), 'Product') || ' | FoundOurMarket', 70);
$$;

-- Meta description, natural language, clamped to 160 chars
CREATE OR REPLACE FUNCTION public.fom_seo_description(p_name text, p_category text, p_tagline text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT left(
    'Shop ' || coalesce(nullif(trim(p_name), ''), 'this product')
    || CASE WHEN coalesce(trim(p_tagline), '') <> '' THEN ' — ' || trim(p_tagline) ELSE '' END
    || ' at FoundOurMarket'
    || CASE WHEN coalesce(trim(p_category), '') <> '' THEN '. Premium ' || trim(p_category) ELSE '' END
    || ' with secure checkout, fast worldwide shipping and easy returns.',
    160);
$$;

-- Keyword list (deduped, no stuffing)
CREATE OR REPLACE FUNCTION public.fom_seo_keywords(p_name text, p_category text, p_tags text[])
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT array_agg(kw) FROM (
    SELECT DISTINCT kw FROM (
      SELECT lower(trim(p_name)) AS kw
      UNION ALL SELECT lower(trim(p_category))
      UNION ALL SELECT 'foundourmarket'
      UNION ALL SELECT lower(trim(t)) FROM unnest(coalesce(p_tags, '{}'::text[])) AS t
    ) raw
    WHERE coalesce(kw,'') <> '' AND length(kw) > 1
    LIMIT 12
  ) d;
$$;

-- BEFORE INSERT/UPDATE trigger: fill SEO + slug ONLY when missing.
-- Never overwrites manually entered SEO values.
CREATE OR REPLACE FUNCTION public.fom_products_seo_autofill()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  i int := 1;
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    base := nullif(public.fom_slugify(NEW.name), '');
    base := coalesce(base, 'product');
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = candidate AND id <> NEW.id) LOOP
      candidate := base || '-' || i;
      i := i + 1;
    END LOOP;
    NEW.slug := candidate;
  END IF;

  IF NEW.seo_title IS NULL OR trim(NEW.seo_title) = '' THEN
    NEW.seo_title := public.fom_seo_title(NEW.name);
  END IF;

  IF NEW.seo_description IS NULL OR trim(NEW.seo_description) = '' THEN
    NEW.seo_description := public.fom_seo_description(NEW.name, NEW.category, NEW.tagline);
  END IF;

  IF NEW.meta_keywords IS NULL OR array_length(NEW.meta_keywords, 1) IS NULL THEN
    NEW.meta_keywords := public.fom_seo_keywords(NEW.name, NEW.category, NEW.tags);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_seo_autofill ON public.products;
CREATE TRIGGER trg_products_seo_autofill
  BEFORE INSERT OR UPDATE OF name, category, tagline, tags, slug, seo_title, seo_description, meta_keywords
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.fom_products_seo_autofill();

-- Expose brand + product_type on the public catalog view for storefront SEO.
CREATE OR REPLACE VIEW public.products_public AS
  SELECT id, slug, name, tagline, category, price, rating, reviews, image, description,
    in_stock, discount, sort_order, created_at, updated_at, featured, sku, stock_quantity,
    low_stock_threshold, reserved_quantity, views_count, price_inr, compare_price_inr,
    price_usd, compare_price_usd, india_visible, international_visible, warranty, status,
    shipping_fee_inr, shipping_fee_usd, razorpay_enabled, stripe_enabled, paypal_enabled,
    cod_enabled, return_eligible, replacement_eligible, return_window_days, pickup_supported,
    international_shipping, fragile, customs_info, restock_eta, preorder, scheduled_publish_at,
    scheduled_expiry_at, sold_count, wishlist_count, tags, features, meta_keywords, seo_title,
    seo_description, specifications, attributes, bestseller, trending, new_arrival, hot_deal,
    inventory_tracking, shipping_class, delivery_estimate, collection, homepage_section,
    flash_deal, staff_pick, recommended, homepage_hero, gift_idea, is_category_banner,
    hide_from_search, hide_from_recommendations, homepage_position, category_position,
    featured_until, related_products, cross_sell_products, upsell_products, premium,
    fast_selling, editors_choice, priority_score, collections, rating_source,
    brand, product_type
  FROM products
  WHERE deleted_at IS NULL;

GRANT SELECT ON public.products_public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fom_slugify(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fom_seo_title(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fom_seo_description(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fom_seo_keywords(text, text, text[]) TO anon, authenticated, service_role;