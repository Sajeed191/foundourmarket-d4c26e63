-- 1. Product questions: remove the public "viewable by everyone" SELECT policy
--    that exposed author user_id. Public reads go through the SECURITY DEFINER
--    function get_product_questions (which omits user_id). Keep staff read access
--    for moderation/analytics.
DROP POLICY IF EXISTS "questions viewable by everyone" ON public.product_questions;

CREATE POLICY "staff select questions"
ON public.product_questions
FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]));

-- 2. Helper: can the current user access a given support-thread realtime topic?
CREATE OR REPLACE FUNCTION public.can_access_support_thread(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tid uuid;
BEGIN
  BEGIN
    _tid := substring(_topic from 'support-thread:(.*)')::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF _tid IS NULL THEN
    RETURN false;
  END IF;

  IF has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role]) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = _tid
      AND (t.user_id = auth.uid() OR t.assigned_to = auth.uid())
  );
END;
$$;

-- 3. Recreate authenticated realtime SELECT policy: scope support-thread topics
--    to ticket owner / assignee / staff instead of allowing any authenticated user.
DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;

CREATE POLICY "fom_realtime_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN (realtime.topic() ~~ 'notifications:%'::text) THEN (realtime.topic() = ('notifications:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'addresses:%'::text) THEN (realtime.topic() = ('addresses:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'account-orders:%'::text) THEN (realtime.topic() = ('account-orders:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'spm-%'::text) THEN (realtime.topic() = ('spm-'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'support-tickets:%'::text) THEN (realtime.topic() = ('support-tickets:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'wishlist-alerts-%'::text) THEN (realtime.topic() = ('wishlist-alerts-'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'chat-orders:%'::text) THEN (realtime.topic() = ('chat-orders:'::text || (auth.uid())::text))
    WHEN (realtime.topic() ~~ 'support-thread:%'::text) THEN public.can_access_support_thread(realtime.topic())
    WHEN ((realtime.topic() ~~ 'rt-products%'::text) OR (realtime.topic() ~~ 'rt-product%'::text) OR (realtime.topic() ~~ 'rt-banners-%'::text) OR (realtime.topic() ~~ 'rt-cms-%'::text) OR (realtime.topic() ~~ 'rt-cart-%'::text) OR (realtime.topic() ~~ 'reviews:%'::text) OR (realtime.topic() = 'categories-live'::text) OR (realtime.topic() = 'rt-testimonials'::text) OR (realtime.topic() = 'rt-announcements'::text) OR (realtime.topic() = 'rt-homepage-sections'::text) OR (realtime.topic() = 'rt-storefront-blocks'::text) OR (realtime.topic() = 'rt-badge-settings'::text) OR (realtime.topic() = 'rt-flash-deals'::text) OR (realtime.topic() = 'rt-campaign-events'::text) OR (realtime.topic() = 'store-settings-live'::text)) THEN true
    WHEN ((realtime.topic() ~~ 'live-%'::text) OR (realtime.topic() = 'activity-feed'::text) OR (realtime.topic() ~~ 'fin-%'::text) OR (realtime.topic() ~~ 'financial-%'::text) OR (realtime.topic() ~~ 'exec-%'::text) OR (realtime.topic() ~~ 'cust-intel%'::text) OR (realtime.topic() ~~ 'customer-marketing%'::text) OR (realtime.topic() ~~ 'cust-mkt%'::text) OR (realtime.topic() = 'intel-rt'::text) OR (realtime.topic() ~~ 'fraud-%'::text) OR (realtime.topic() ~~ 'traffic-%'::text) OR (realtime.topic() ~~ 'mkt-%'::text) OR (realtime.topic() ~~ 'ai-ops-%'::text) OR (realtime.topic() ~~ 'ai-fb-%'::text) OR (realtime.topic() = 'analytics-live'::text) OR (realtime.topic() = 'storefront-dashboard'::text) OR (realtime.topic() = 'dash-draft-activity'::text) OR (realtime.topic() ~~ 'inventory-marketing%'::text) OR (realtime.topic() ~~ 'product-marketing%'::text) OR (realtime.topic() = 'bulk-visibility'::text) OR (realtime.topic() ~~ 'admin-%'::text) OR (realtime.topic() ~~ 'user-intel-%'::text) OR (realtime.topic() = 'category-cms'::text) OR (realtime.topic() ~~ 'marketplace%'::text) OR (realtime.topic() = 'orders-live'::text) OR (realtime.topic() = 'shipment-command-center'::text) OR (realtime.topic() ~~ 'order-drawer-%'::text) OR (realtime.topic() ~~ 'pay-drawer-%'::text) OR (realtime.topic() ~~ 'order-ops-%'::text) OR (realtime.topic() = 'support-settings-live'::text) OR (realtime.topic() = 'rt-growth-center'::text) OR (realtime.topic() = 'rt-cms-posts-list'::text) OR (realtime.topic() = 'payment-gateways-live'::text)) THEN has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role])
    ELSE false
  END
);

-- 4. Recreate anonymous realtime SELECT policy WITHOUT store-settings-live.
DROP POLICY IF EXISTS "fom_realtime_select_anon" ON realtime.messages;

CREATE POLICY "fom_realtime_select_anon"
ON realtime.messages
FOR SELECT
TO anon
USING (
  (realtime.topic() ~~ 'rt-products%'::text)
  OR (realtime.topic() = 'categories-live'::text)
  OR (realtime.topic() ~~ 'rt-banners-%'::text)
  OR (realtime.topic() = 'rt-testimonials'::text)
  OR (realtime.topic() ~~ 'reviews:%'::text)
  OR (realtime.topic() = 'rt-announcements'::text)
  OR (realtime.topic() ~~ 'rt-cms-%'::text)
  OR (realtime.topic() = 'rt-homepage-sections'::text)
  OR (realtime.topic() = 'rt-storefront-blocks'::text)
  OR (realtime.topic() = 'rt-badge-settings'::text)
);