
-- updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PRICE ALERTS ============
CREATE TABLE public.wishlist_price_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  target_price NUMERIC NOT NULL CHECK (target_price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'active',
  last_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_at TIMESTAMPTZ,
  UNIQUE (user_id, product_slug, currency, target_price)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_price_alerts TO authenticated;
GRANT ALL ON public.wishlist_price_alerts TO service_role;

ALTER TABLE public.wishlist_price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own price alerts select" ON public.wishlist_price_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own price alerts insert" ON public.wishlist_price_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own price alerts update" ON public.wishlist_price_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own price alerts delete" ON public.wishlist_price_alerts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_wpa_user ON public.wishlist_price_alerts (user_id);
CREATE INDEX idx_wpa_slug_status ON public.wishlist_price_alerts (product_slug, status);

CREATE TRIGGER trg_wpa_updated BEFORE UPDATE ON public.wishlist_price_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RESTOCK ALERTS ============
CREATE TABLE public.wishlist_restock_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  UNIQUE (user_id, product_slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_restock_alerts TO authenticated;
GRANT ALL ON public.wishlist_restock_alerts TO service_role;

ALTER TABLE public.wishlist_restock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own restock alerts select" ON public.wishlist_restock_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own restock alerts insert" ON public.wishlist_restock_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own restock alerts update" ON public.wishlist_restock_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own restock alerts delete" ON public.wishlist_restock_alerts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_wra_user ON public.wishlist_restock_alerts (user_id);
CREATE INDEX idx_wra_slug_status ON public.wishlist_restock_alerts (product_slug, status);

CREATE TRIGGER trg_wra_updated BEFORE UPDATE ON public.wishlist_restock_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ NOTIFICATION PREFERENCES ============
CREATE TABLE public.wishlist_notification_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  price_drop BOOLEAN NOT NULL DEFAULT true,
  back_in_stock BOOLEAN NOT NULL DEFAULT true,
  low_stock BOOLEAN NOT NULL DEFAULT true,
  flash_sale BOOLEAN NOT NULL DEFAULT true,
  new_arrival BOOLEAN NOT NULL DEFAULT true,
  collection_updates BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_notification_preferences TO authenticated;
GRANT ALL ON public.wishlist_notification_preferences TO service_role;

ALTER TABLE public.wishlist_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own prefs select" ON public.wishlist_notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own prefs insert" ON public.wishlist_notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own prefs update" ON public.wishlist_notification_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER trg_wnp_updated BEFORE UPDATE ON public.wishlist_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ACTIVITY LOGS ============
CREATE TABLE public.wishlist_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  product_slug TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.wishlist_activity_logs TO authenticated;
GRANT ALL ON public.wishlist_activity_logs TO service_role;

ALTER TABLE public.wishlist_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own activity select" ON public.wishlist_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own activity insert" ON public.wishlist_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wal_user ON public.wishlist_activity_logs (user_id, created_at DESC);
CREATE INDEX idx_wal_action ON public.wishlist_activity_logs (action);

-- ============ REALTIME ============
ALTER TABLE public.wishlist_price_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.wishlist_restock_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wishlist_price_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wishlist_restock_alerts;
