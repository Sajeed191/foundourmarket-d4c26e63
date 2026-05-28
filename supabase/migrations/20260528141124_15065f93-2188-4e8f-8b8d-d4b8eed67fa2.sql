
-- 1. Tighten orders update policy
DROP POLICY IF EXISTS "own orders update" ON public.orders;
CREATE POLICY "own orders update" ON public.orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND payment_status = 'pending'
  );

-- 2. Fix visitor_sessions update policy (block unauthenticated)
DROP POLICY IF EXISTS "own visitor session update" ON public.visitor_sessions;
CREATE POLICY "own visitor session update" ON public.visitor_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- 3. Hide products.cost from anonymous visitors (column-level)
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, slug, name, tagline, category, price, rating, reviews, image,
  description, in_stock, discount, sort_order, created_at, updated_at,
  featured, sku, stock_quantity, low_stock_threshold, reserved_quantity,
  views_count
) ON public.products TO anon;

-- 4. Hide promo code internals from anonymous visitors (column-level)
REVOKE SELECT ON public.promo_codes FROM anon;
GRANT SELECT (
  id, code, kind, value, min_subtotal, active, expires_at, created_at
) ON public.promo_codes TO anon;

-- 5. Realtime channel authorization
DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;
CREATE POLICY "fom_realtime_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'live-%' OR realtime.topic() = 'activity-feed'
        THEN public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role])
      WHEN realtime.topic() LIKE 'notifications:%'
        THEN realtime.topic() = 'notifications:' || auth.uid()::text
      ELSE true
    END
  );

DROP POLICY IF EXISTS "fom_realtime_insert" ON realtime.messages;
CREATE POLICY "fom_realtime_insert" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN realtime.topic() LIKE 'live-%' OR realtime.topic() = 'activity-feed'
        THEN public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role])
      ELSE true
    END
  );
