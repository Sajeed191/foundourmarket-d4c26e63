
-- Fix spoofable user_id INSERT policies
DROP POLICY IF EXISTS "attr_touches public insert" ON public.attribution_touches;
CREATE POLICY "attr_touches public insert" ON public.attribution_touches
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "anyone insert page views" ON public.page_views;
CREATE POLICY "anyone insert page views" ON public.page_views
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "anyone insert search logs" ON public.search_logs;
CREATE POLICY "anyone insert search logs" ON public.search_logs
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Add public SELECT policies for storefront content
CREATE POLICY "public read active banners" ON public.banners
  FOR SELECT TO public USING (
    status = 'published' AND active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

CREATE POLICY "public read published pages" ON public.cms_pages
  FOR SELECT TO public USING (published = true);

CREATE POLICY "public read published posts" ON public.cms_posts
  FOR SELECT TO public USING (published_at IS NOT NULL AND published_at <= now());

CREATE POLICY "public read answered questions" ON public.product_questions
  FOR SELECT TO public USING (answer IS NOT NULL);
