-- Use default replica identity (primary key) so column-restricted realtime works
ALTER TABLE public.orders REPLICA IDENTITY DEFAULT;
ALTER TABLE public.payments REPLICA IDENTITY DEFAULT;

-- Re-publish orders with ONLY non-sensitive columns (excludes contact_email,
-- shipping_address, razorpay_order_id, razorpay_payment_id).
ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders
  (id, user_id, status, currency, subtotal, shipping, tax, total, created_at,
   updated_at, discount, promo_code, payment_method, payment_status,
   fulfillment_status, tracking_number, carrier, stock_state, expires_at,
   market_region, payment_provider, is_seeded, attribution_session_id,
   attribution_utm, paid_at, fulfilled_at, cancelled_at, cancel_window_expires_at);

-- Re-publish payments with ONLY non-sensitive columns (excludes transaction_id,
-- signature, razorpay_order_id, razorpay_payment_id, fee, gateway_tax, meta).
ALTER PUBLICATION supabase_realtime DROP TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments
  (id, order_id, user_id, method, status, amount, currency, demo, created_at, is_seeded);

-- Restrict staff visibility of saved payment methods to super_admin only.
DROP POLICY IF EXISTS "admins view all payment methods" ON public.saved_payment_methods;
CREATE POLICY "super admins view all payment methods"
  ON public.saved_payment_methods FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));