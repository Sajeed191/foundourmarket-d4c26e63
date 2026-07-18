-- Perf indexes for the hottest customer-facing and analytics queries.
-- All CREATE INDEX IF NOT EXISTS so the migration is idempotent.

-- 1) products_public grid scan: ORDER BY sort_order with the customer-side
-- deleted_at IS NULL / status='published' filter applied by the view.
CREATE INDEX IF NOT EXISTS idx_products_pub_sort
  ON public.products (sort_order)
  WHERE deleted_at IS NULL AND status = 'published';

-- 2) product detail lookup by slug (already unique but ensure a covering path
-- for the customer view predicate).
CREATE INDEX IF NOT EXISTS idx_products_slug_pub
  ON public.products (slug)
  WHERE deleted_at IS NULL AND status = 'published';

-- 3) analytics_events: dashboards always slice by recency (created_at) and
-- frequently by event type. A composite index unblocks both traffic and fraud
-- intelligence scans, which currently seq-scan tens of thousands of rows.
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_event
  ON public.analytics_events (created_at DESC, event);

-- 4) page_views count(*) since <cutoff> is used on every admin traffic load.
CREATE INDEX IF NOT EXISTS idx_page_views_created
  ON public.page_views (created_at DESC);

-- 5) orders recency scan used by every admin dashboard.
CREATE INDEX IF NOT EXISTS idx_orders_created_status
  ON public.orders (created_at DESC, status);

-- 6) recommendation_events and notifications appear repeatedly in slow queries
-- (thousands of calls). Ensure their recency filter is index-served.
CREATE INDEX IF NOT EXISTS idx_recommendation_events_created
  ON public.recommendation_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
