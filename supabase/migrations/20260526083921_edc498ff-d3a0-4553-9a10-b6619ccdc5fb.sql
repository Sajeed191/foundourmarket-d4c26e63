
-- Profit & popularity columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

-- BANNERS
CREATE TABLE IF NOT EXISTS public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'hero',
  title text NOT NULL,
  subtitle text,
  image text,
  link text,
  cta_text text,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active banners public" ON public.banners FOR SELECT USING (
  active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())
);
CREATE POLICY "editors view all banners" ON public.banners FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[])
);
CREATE POLICY "editors insert banners" ON public.banners FOR INSERT WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[])
);
CREATE POLICY "editors update banners" ON public.banners FOR UPDATE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[])
);
CREATE POLICY "editors delete banners" ON public.banners FOR DELETE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[])
);
CREATE TRIGGER trg_banners_updated_at BEFORE UPDATE ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FLASH SALES
CREATE TABLE IF NOT EXISTS public.flash_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_percent integer NOT NULL DEFAULT 10,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  product_slugs text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active flash sales public" ON public.flash_sales FOR SELECT USING (
  active = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at >= now())
);
CREATE POLICY "managers view all flash sales" ON public.flash_sales FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);
CREATE POLICY "managers manage flash sales insert" ON public.flash_sales FOR INSERT WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);
CREATE POLICY "managers manage flash sales update" ON public.flash_sales FOR UPDATE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);
CREATE POLICY "managers manage flash sales delete" ON public.flash_sales FOR DELETE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);
CREATE TRIGGER trg_flash_sales_updated_at BEFORE UPDATE ON public.flash_sales
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SEARCH LOGS
CREATE TABLE IF NOT EXISTS public.search_logs (
  id bigserial PRIMARY KEY,
  query text NOT NULL,
  results_count integer NOT NULL DEFAULT 0,
  user_id uuid,
  session_id text,
  clicked_product_slug text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON public.search_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_query ON public.search_logs(lower(query));
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone insert search logs" ON public.search_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "managers read search logs" ON public.search_logs FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);

-- PAGE VIEWS
CREATE TABLE IF NOT EXISTS public.page_views (
  id bigserial PRIMARY KEY,
  path text NOT NULL,
  user_id uuid,
  session_id text,
  referrer text,
  user_agent text,
  country text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON public.page_views(path);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON public.page_views(session_id);
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone insert page views" ON public.page_views FOR INSERT WITH CHECK (true);
CREATE POLICY "managers read page views" ON public.page_views FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);

-- VISITOR SESSIONS
CREATE TABLE IF NOT EXISTS public.visitor_sessions (
  session_id text PRIMARY KEY,
  user_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  page_views integer NOT NULL DEFAULT 0,
  country text,
  device text,
  referrer text,
  landing_path text
);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_seen ON public.visitor_sessions(last_seen DESC);
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone insert visitor session" ON public.visitor_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone update own visitor session" ON public.visitor_sessions FOR UPDATE USING (true);
CREATE POLICY "managers read visitor sessions" ON public.visitor_sessions FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager']::app_role[])
);

-- CUSTOMER NOTES
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  author_id uuid,
  note text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON public.customer_notes(customer_id);
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support manage customer notes select" ON public.customer_notes FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);
CREATE POLICY "support manage customer notes insert" ON public.customer_notes FOR INSERT WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);
CREATE POLICY "support manage customer notes update" ON public.customer_notes FOR UPDATE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);
CREATE POLICY "support manage customer notes delete" ON public.customer_notes FOR DELETE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);
CREATE TRIGGER trg_customer_notes_updated_at BEFORE UPDATE ON public.customer_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CUSTOMER TAGS
CREATE TABLE IF NOT EXISTS public.customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_customer_tags_customer ON public.customer_tags(customer_id);
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support manage tags select" ON public.customer_tags FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);
CREATE POLICY "support manage tags insert" ON public.customer_tags FOR INSERT WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);
CREATE POLICY "support manage tags delete" ON public.customer_tags FOR DELETE USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])
);

-- ADMIN ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read activity logs" ON public.admin_activity_logs FOR SELECT USING (
  has_any_role(auth.uid(), ARRAY['admin','super_admin']::app_role[])
);
CREATE POLICY "admins insert activity logs" ON public.admin_activity_logs FOR INSERT WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support','editor','warehouse_staff']::app_role[])
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_sessions;
