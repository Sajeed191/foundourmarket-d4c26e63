-- 1. New merchandising columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fast_selling boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editors_choice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_score integer,
  ADD COLUMN IF NOT EXISTS collections text[] NOT NULL DEFAULT '{}';

-- 2. Expose the new public-safe columns through the storefront view
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
  featured_until, related_products, cross_sell_products, upsell_products, orders_count,
  premium, fast_selling, editors_choice, priority_score, collections
FROM public.products
WHERE deleted_at IS NULL;

-- 3. Extend the bulk action function: more badge flags, priority + collections
CREATE OR REPLACE FUNCTION public.admin_bulk_products(_ids uuid[], _action text, _params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_count int := 0;
  v_before jsonb;
  v_tags text[];
  v_num numeric;
  v_txt text;
  v_bool boolean;
  v_ts timestamptz;
  r record;
  new_slug text;
  new_id uuid;
BEGIN
  IF NOT public.has_any_role(v_actor, ARRAY['admin','super_admin','manager','editor','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'affected', 0, 'error', 'no ids');
  END IF;

  SELECT jsonb_agg(to_jsonb(p)) INTO v_before
  FROM (
    SELECT id, slug, status, stock_quantity, low_stock_threshold, price_inr, price_usd,
           compare_price_inr, compare_price_usd, india_visible, international_visible,
           featured, trending, bestseller, new_arrival, hot_deal, category, collection,
           homepage_section, tags, deleted_at, cod_enabled, return_eligible, warranty,
           shipping_class, delivery_estimate, inventory_tracking, scheduled_publish_at,
           scheduled_expiry_at, premium, fast_selling, editors_choice, staff_pick,
           flash_deal, recommended, priority_score, collections
    FROM public.products WHERE id = ANY(_ids) LIMIT 500
  ) p;

  IF _action = 'publish' THEN
    UPDATE public.products SET status='published', deleted_at=NULL WHERE id=ANY(_ids);
  ELSIF _action = 'unpublish' THEN
    UPDATE public.products SET status='hidden' WHERE id=ANY(_ids);
  ELSIF _action = 'archive' THEN
    UPDATE public.products SET status='archived' WHERE id=ANY(_ids);
  ELSIF _action = 'restore' THEN
    UPDATE public.products SET status='published', deleted_at=NULL, deleted_by=NULL WHERE id=ANY(_ids);
  ELSIF _action = 'soft_delete' THEN
    UPDATE public.products SET deleted_at=now(), deleted_by=v_actor, status='archived' WHERE id=ANY(_ids);
  ELSIF _action = 'restore_deleted' THEN
    UPDATE public.products SET deleted_at=NULL, deleted_by=NULL, status='draft' WHERE id=ANY(_ids);
  ELSIF _action = 'permanent_delete' THEN
    DELETE FROM public.products WHERE id=ANY(_ids) AND deleted_at IS NOT NULL;
  ELSIF _action = 'duplicate' THEN
    FOR r IN SELECT * FROM public.products WHERE id=ANY(_ids) LOOP
      new_id := gen_random_uuid();
      new_slug := r.slug || '-copy-' || substr(replace(new_id::text,'-',''),1,6);
      INSERT INTO public.products (
        id, slug, name, tagline, category, price, rating, reviews, image, description,
        in_stock, discount, sort_order, featured, sku, stock_quantity, low_stock_threshold,
        reserved_quantity, cost, views_count, price_inr, compare_price_inr, price_usd,
        compare_price_usd, india_visible, international_visible, warranty, status,
        cost_price_inr, cost_price_usd, shipping_fee_inr, shipping_fee_usd, razorpay_enabled,
        stripe_enabled, paypal_enabled, cod_enabled, return_eligible, replacement_eligible,
        return_window_days, pickup_supported, international_shipping, fragile, customs_info,
        barcode, warehouse_location, restock_eta, preorder, tags, features, meta_keywords,
        seo_title, seo_description, specifications, attributes, bestseller, trending,
        new_arrival, hot_deal, inventory_tracking, shipping_class, delivery_estimate,
        collection, homepage_section, premium, fast_selling, editors_choice, priority_score, collections
      ) VALUES (
        new_id, new_slug, r.name || ' (Copy)', r.tagline, r.category, r.price, 0, 0, r.image, r.description,
        r.in_stock, r.discount, r.sort_order, r.featured, NULL, r.stock_quantity, r.low_stock_threshold,
        0, r.cost, 0, r.price_inr, r.compare_price_inr, r.price_usd,
        r.compare_price_usd, r.india_visible, r.international_visible, r.warranty, 'draft',
        r.cost_price_inr, r.cost_price_usd, r.shipping_fee_inr, r.shipping_fee_usd, r.razorpay_enabled,
        r.stripe_enabled, r.paypal_enabled, r.cod_enabled, r.return_eligible, r.replacement_eligible,
        r.return_window_days, r.pickup_supported, r.international_shipping, r.fragile, r.customs_info,
        NULL, r.warehouse_location, r.restock_eta, r.preorder, r.tags, r.features, r.meta_keywords,
        r.seo_title, r.seo_description, r.specifications, r.attributes, r.bestseller, r.trending,
        r.new_arrival, r.hot_deal, r.inventory_tracking, r.shipping_class, r.delivery_estimate,
        r.collection, r.homepage_section, r.premium, r.fast_selling, r.editors_choice, r.priority_score, r.collections
      );
      INSERT INTO public.product_images (product_slug, url, alt, sort_order)
      SELECT new_slug, url, alt, sort_order FROM public.product_images WHERE product_slug = r.slug;
      v_count := v_count + 1;
    END LOOP;
  ELSIF _action = 'move_category' THEN
    UPDATE public.products SET category = (_params->>'category') WHERE id=ANY(_ids);
  ELSIF _action = 'set_collection' THEN
    UPDATE public.products SET collection = NULLIF(_params->>'collection','') WHERE id=ANY(_ids);
  ELSIF _action = 'set_collections' THEN
    v_tags := ARRAY(SELECT jsonb_array_elements_text(_params->'collections'));
    UPDATE public.products SET collections = v_tags WHERE id=ANY(_ids);
  ELSIF _action = 'set_homepage_section' THEN
    UPDATE public.products SET homepage_section = NULLIF(_params->>'section','') WHERE id=ANY(_ids);
  ELSIF _action = 'set_priority' THEN
    UPDATE public.products SET priority_score = NULLIF(_params->>'value','')::int WHERE id=ANY(_ids);
  ELSIF _action = 'set_stock' THEN
    UPDATE public.products SET stock_quantity = GREATEST(0,(_params->>'value')::int), in_stock = (_params->>'value')::int > 0 WHERE id=ANY(_ids);
  ELSIF _action = 'inc_stock' THEN
    UPDATE public.products SET stock_quantity = stock_quantity + (_params->>'value')::int, in_stock = true WHERE id=ANY(_ids);
  ELSIF _action = 'dec_stock' THEN
    UPDATE public.products SET stock_quantity = GREATEST(0, stock_quantity - (_params->>'value')::int), in_stock = (stock_quantity - (_params->>'value')::int) > 0 WHERE id=ANY(_ids);
  ELSIF _action = 'set_low_threshold' THEN
    UPDATE public.products SET low_stock_threshold = GREATEST(0,(_params->>'value')::int) WHERE id=ANY(_ids);
  ELSIF _action = 'set_inventory_tracking' THEN
    UPDATE public.products SET inventory_tracking = (_params->>'value')::boolean WHERE id=ANY(_ids);
  ELSIF _action = 'set_price_inr' THEN
    UPDATE public.products SET price_inr = (_params->>'value')::numeric WHERE id=ANY(_ids);
  ELSIF _action = 'set_price_usd' THEN
    UPDATE public.products SET price_usd = (_params->>'value')::numeric WHERE id=ANY(_ids);
  ELSIF _action = 'inc_price_pct' THEN
    v_num := (_params->>'value')::numeric;
    UPDATE public.products SET
      price_inr = round(COALESCE(price_inr,0) * (1 + v_num/100.0), 2),
      price_usd = round(COALESCE(price_usd,0) * (1 + v_num/100.0), 2)
    WHERE id=ANY(_ids);
  ELSIF _action = 'dec_price_pct' THEN
    v_num := (_params->>'value')::numeric;
    UPDATE public.products SET
      price_inr = GREATEST(0, round(COALESCE(price_inr,0) * (1 - v_num/100.0), 2)),
      price_usd = GREATEST(0, round(COALESCE(price_usd,0) * (1 - v_num/100.0), 2))
    WHERE id=ANY(_ids);
  ELSIF _action = 'set_sale' THEN
    v_num := (_params->>'pct')::numeric;
    UPDATE public.products SET
      compare_price_inr = COALESCE(compare_price_inr, price_inr),
      compare_price_usd = COALESCE(compare_price_usd, price_usd),
      price_inr = GREATEST(0, round(COALESCE(price_inr,0) * (1 - v_num/100.0), 2)),
      price_usd = GREATEST(0, round(COALESCE(price_usd,0) * (1 - v_num/100.0), 2))
    WHERE id=ANY(_ids);
  ELSIF _action = 'remove_sale' THEN
    UPDATE public.products SET
      price_inr = COALESCE(compare_price_inr, price_inr),
      price_usd = COALESCE(compare_price_usd, price_usd),
      compare_price_inr = NULL, compare_price_usd = NULL
    WHERE id=ANY(_ids);
  ELSIF _action = 'round_price' THEN
    UPDATE public.products SET
      price_inr = CASE WHEN price_inr IS NULL THEN NULL ELSE floor(price_inr) + 0.99 END,
      price_usd = CASE WHEN price_usd IS NULL THEN NULL ELSE floor(price_usd) + 0.99 END
    WHERE id=ANY(_ids);
  ELSIF _action = 'add_tags' THEN
    v_tags := ARRAY(SELECT jsonb_array_elements_text(_params->'tags'));
    UPDATE public.products SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}') || v_tags)) WHERE id=ANY(_ids);
  ELSIF _action = 'remove_tags' THEN
    v_tags := ARRAY(SELECT jsonb_array_elements_text(_params->'tags'));
    UPDATE public.products SET tags = ARRAY(SELECT unnest(COALESCE(tags,'{}')) EXCEPT SELECT unnest(v_tags)) WHERE id=ANY(_ids);
  ELSIF _action = 'replace_tags' THEN
    v_tags := ARRAY(SELECT jsonb_array_elements_text(_params->'tags'));
    UPDATE public.products SET tags = v_tags WHERE id=ANY(_ids);
  ELSIF _action = 'set_badge' THEN
    v_txt := _params->>'badge'; v_bool := (_params->>'value')::boolean;
    IF v_txt = 'featured' THEN UPDATE public.products SET featured=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'trending' THEN UPDATE public.products SET trending=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'bestseller' THEN UPDATE public.products SET bestseller=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'new_arrival' THEN UPDATE public.products SET new_arrival=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'hot_deal' THEN UPDATE public.products SET hot_deal=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'premium' THEN UPDATE public.products SET premium=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'fast_selling' THEN UPDATE public.products SET fast_selling=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'staff_pick' THEN UPDATE public.products SET staff_pick=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'editors_choice' THEN UPDATE public.products SET editors_choice=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'flash_deal' THEN UPDATE public.products SET flash_deal=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'recommended' THEN UPDATE public.products SET recommended=v_bool WHERE id=ANY(_ids);
    ELSIF v_txt = 'gift_idea' THEN UPDATE public.products SET gift_idea=v_bool WHERE id=ANY(_ids);
    END IF;
  ELSIF _action = 'set_region' THEN
    v_txt := _params->>'region';
    IF v_txt = 'india' THEN UPDATE public.products SET india_visible=true, international_visible=false WHERE id=ANY(_ids);
    ELSIF v_txt = 'international' THEN UPDATE public.products SET india_visible=false, international_visible=true WHERE id=ANY(_ids);
    ELSE UPDATE public.products SET india_visible=true, international_visible=true WHERE id=ANY(_ids);
    END IF;
  ELSIF _action = 'set_cod' THEN
    UPDATE public.products SET cod_enabled = (_params->>'value')::boolean WHERE id=ANY(_ids);
  ELSIF _action = 'set_return' THEN
    UPDATE public.products SET return_eligible = (_params->>'value')::boolean WHERE id=ANY(_ids);
  ELSIF _action = 'set_warranty' THEN
    UPDATE public.products SET warranty = NULLIF(_params->>'value','') WHERE id=ANY(_ids);
  ELSIF _action = 'set_shipping_class' THEN
    UPDATE public.products SET shipping_class = NULLIF(_params->>'value','') WHERE id=ANY(_ids);
  ELSIF _action = 'set_delivery_estimate' THEN
    UPDATE public.products SET delivery_estimate = NULLIF(_params->>'value','') WHERE id=ANY(_ids);
  ELSIF _action = 'schedule_publish' THEN
    UPDATE public.products SET scheduled_publish_at = (_params->>'at')::timestamptz, status='scheduled' WHERE id=ANY(_ids);
  ELSIF _action = 'schedule_unpublish' THEN
    UPDATE public.products SET scheduled_expiry_at = (_params->>'at')::timestamptz WHERE id=ANY(_ids);
  ELSE
    RAISE EXCEPTION 'Unknown action: %', _action;
  END IF;

  IF _action <> 'duplicate' THEN
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  INSERT INTO public.admin_activity_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_actor,
    'bulk_' || _action,
    'product',
    array_length(_ids,1)::text,
    jsonb_build_object(
      'action', _action,
      'params', _params,
      'ids', to_jsonb(_ids),
      'affected', v_count,
      'before', COALESCE(v_before, '[]'::jsonb)
    )
  );

  RETURN jsonb_build_object('ok', true, 'affected', v_count, 'action', _action);
END $function$;