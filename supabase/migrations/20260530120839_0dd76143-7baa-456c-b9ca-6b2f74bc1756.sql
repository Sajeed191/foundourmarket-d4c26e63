-- ============================================================
-- 1. Extend product_reviews
-- ============================================================
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_purchase boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_helpful_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reply text,
  ADD COLUMN IF NOT EXISTS admin_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_reply_by uuid,
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS sentiment_summary text,
  ADD COLUMN IF NOT EXISTS sentiment_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fake_score numeric,
  ADD COLUMN IF NOT EXISTS fake_reasons text,
  ADD COLUMN IF NOT EXISTS moderation_analyzed_at timestamptz;

-- status validation trigger (no CHECK constraint per project rules)
CREATE OR REPLACE FUNCTION public.validate_review_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('published','pending','hidden','rejected') THEN
    RAISE EXCEPTION 'invalid review status: %', NEW.status;
  END IF;
  IF NEW.sentiment IS NOT NULL AND NEW.sentiment NOT IN ('positive','neutral','negative','mixed') THEN
    RAISE EXCEPTION 'invalid sentiment: %', NEW.sentiment;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_review_status ON public.product_reviews;
CREATE TRIGGER trg_validate_review_status
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_status();

-- updated_at maintenance
DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-detect verified purchase on insert
CREATE OR REPLACE FUNCTION public.mark_review_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.verified_purchase := EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_slug = NEW.product_slug
      AND o.user_id = NEW.user_id
      AND (o.payment_status = 'paid' OR o.status IN ('paid','fulfilled','delivered','shipped'))
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mark_review_verified ON public.product_reviews;
CREATE TRIGGER trg_mark_review_verified
  BEFORE INSERT ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.mark_review_verified();

-- protect moderation columns from non-staff edits
CREATE OR REPLACE FUNCTION public.protect_review_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]) THEN
    NEW.status := OLD.status;
    NEW.pinned := OLD.pinned;
    NEW.featured := OLD.featured;
    NEW.verified_purchase := OLD.verified_purchase;
    NEW.helpful_count := OLD.helpful_count;
    NEW.not_helpful_count := OLD.not_helpful_count;
    NEW.report_count := OLD.report_count;
    NEW.is_flagged := OLD.is_flagged;
    NEW.admin_reply := OLD.admin_reply;
    NEW.admin_reply_at := OLD.admin_reply_at;
    NEW.admin_reply_by := OLD.admin_reply_by;
    NEW.sentiment := OLD.sentiment;
    NEW.sentiment_score := OLD.sentiment_score;
    NEW.sentiment_summary := OLD.sentiment_summary;
    NEW.sentiment_analyzed_at := OLD.sentiment_analyzed_at;
    NEW.fake_score := OLD.fake_score;
    NEW.fake_reasons := OLD.fake_reasons;
    NEW.moderation_analyzed_at := OLD.moderation_analyzed_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_review_columns ON public.product_reviews;
CREATE TRIGGER trg_protect_review_columns
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_review_columns();

-- staff can update any review (moderation/reply/pin/feature/AI)
DROP POLICY IF EXISTS "staff update any review" ON public.product_reviews;
CREATE POLICY "staff update any review" ON public.product_reviews
  FOR UPDATE USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

-- ============================================================
-- 2. review_votes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.review_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_review_votes_review ON public.review_votes(review_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_votes TO authenticated;
GRANT ALL ON public.review_votes TO service_role;

ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "votes viewable by everyone" ON public.review_votes FOR SELECT USING (true);
CREATE POLICY "own vote insert" ON public.review_votes FOR INSERT WITH CHECK (auth.uid() = user_id AND vote IN ('helpful','not_helpful'));
CREATE POLICY "own vote update" ON public.review_votes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND vote IN ('helpful','not_helpful'));
CREATE POLICY "own vote delete" ON public.review_votes FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT ON public.review_votes TO anon;

-- ============================================================
-- 3. review_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_review_reports_review ON public.review_reports(review_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_reports TO authenticated;
GRANT ALL ON public.review_reports TO service_role;

ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own report select" ON public.review_reports FOR SELECT
  USING (auth.uid() = user_id OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));
CREATE POLICY "own report insert" ON public.review_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff update reports" ON public.review_reports FOR UPDATE
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));
CREATE POLICY "staff delete reports" ON public.review_reports FOR DELETE
  USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]));

-- ============================================================
-- 4. Tally maintenance triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_review_vote_counts(_review_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.product_reviews p SET
    helpful_count = COALESCE((SELECT count(*) FROM public.review_votes v WHERE v.review_id = _review_id AND v.vote = 'helpful'),0),
    not_helpful_count = COALESCE((SELECT count(*) FROM public.review_votes v WHERE v.review_id = _review_id AND v.vote = 'not_helpful'),0)
  WHERE p.id = _review_id;
END $$;

CREATE OR REPLACE FUNCTION public.on_review_vote_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_review_vote_counts(OLD.review_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_review_vote_counts(NEW.review_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_on_review_vote_change ON public.review_votes;
CREATE TRIGGER trg_on_review_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON public.review_votes
  FOR EACH ROW EXECUTE FUNCTION public.on_review_vote_change();

CREATE OR REPLACE FUNCTION public.on_review_report_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid; cnt int;
BEGIN
  rid := COALESCE(NEW.review_id, OLD.review_id);
  SELECT count(*) INTO cnt FROM public.review_reports WHERE review_id = rid AND status = 'open';
  UPDATE public.product_reviews SET report_count = cnt, is_flagged = (cnt >= 1) WHERE id = rid;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_on_review_report_change ON public.review_reports;
CREATE TRIGGER trg_on_review_report_change
  AFTER INSERT OR UPDATE OR DELETE ON public.review_reports
  FOR EACH ROW EXECUTE FUNCTION public.on_review_report_change();

-- ============================================================
-- 5. Analytics: trust score + staff dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.product_trust_score(_slug text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (
    SELECT rating, verified_purchase, sentiment, COALESCE(fake_score,0) AS fake_score
    FROM public.product_reviews
    WHERE product_slug = _slug AND status = 'published'
  )
  SELECT CASE WHEN count(*) = 0 THEN 0 ELSE
    round(LEAST(100, GREATEST(0,
      (avg(rating)/5.0)*55                                              -- rating quality
      + LEAST(20, count(*)::numeric * 1.5)                             -- volume confidence
      + (count(*) FILTER (WHERE verified_purchase))::numeric / count(*) * 15  -- verified ratio
      + (count(*) FILTER (WHERE sentiment = 'positive'))::numeric / count(*) * 10 -- positive sentiment
      - avg(fake_score) * 0.3                                          -- fake penalty
    )), 1) END
  FROM r;
$$;

GRANT EXECUTE ON FUNCTION public.product_trust_score(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
  conv_with numeric;
  conv_without numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- conversion impact: avg purchase/view ratio for products with vs without reviews
  WITH pv AS (
    SELECT product_slug,
           count(*) FILTER (WHERE event = 'product_view') AS views,
           count(*) FILTER (WHERE event = 'purchase') AS purchases
    FROM public.analytics_events
    WHERE product_slug IS NOT NULL
    GROUP BY product_slug
  ),
  rev AS (SELECT DISTINCT product_slug FROM public.product_reviews WHERE status = 'published')
  SELECT
    COALESCE(avg(CASE WHEN r.product_slug IS NOT NULL AND pv.views > 0 THEN pv.purchases::numeric/pv.views END),0),
    COALESCE(avg(CASE WHEN r.product_slug IS NULL AND pv.views > 0 THEN pv.purchases::numeric/pv.views END),0)
  INTO conv_with, conv_without
  FROM pv LEFT JOIN rev r ON r.product_slug = pv.product_slug;

  SELECT jsonb_build_object(
    'total', count(*),
    'published', count(*) FILTER (WHERE status = 'published'),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'hidden', count(*) FILTER (WHERE status = 'hidden'),
    'rejected', count(*) FILTER (WHERE status = 'rejected'),
    'flagged', count(*) FILTER (WHERE is_flagged),
    'fake_suspected', count(*) FILTER (WHERE COALESCE(fake_score,0) >= 60),
    'with_media', count(*) FILTER (WHERE jsonb_array_length(media) > 0),
    'replied', count(*) FILTER (WHERE admin_reply IS NOT NULL),
    'avg_rating', round(COALESCE(avg(rating) FILTER (WHERE status='published'),0), 2),
    'satisfaction', round(COALESCE(count(*) FILTER (WHERE status='published' AND rating >= 4)::numeric
        / NULLIF(count(*) FILTER (WHERE status='published'),0) * 100, 0), 1),
    'reply_rate', round(COALESCE(count(*) FILTER (WHERE admin_reply IS NOT NULL)::numeric
        / NULLIF(count(*),0) * 100, 0), 1),
    'sentiment', jsonb_build_object(
        'positive', count(*) FILTER (WHERE sentiment = 'positive'),
        'neutral',  count(*) FILTER (WHERE sentiment = 'neutral'),
        'negative', count(*) FILTER (WHERE sentiment = 'negative'),
        'mixed',    count(*) FILTER (WHERE sentiment = 'mixed'),
        'unanalyzed', count(*) FILTER (WHERE sentiment IS NULL)
    ),
    'analyzed', count(*) FILTER (WHERE sentiment IS NOT NULL),
    'conversion_with_reviews', round(conv_with * 100, 2),
    'conversion_without_reviews', round(conv_without * 100, 2)
  ) INTO result
  FROM public.product_reviews;

  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.review_dashboard() TO authenticated, service_role;

-- ============================================================
-- 6. Realtime
-- ============================================================
ALTER TABLE public.product_reviews REPLICA IDENTITY FULL;
ALTER TABLE public.review_votes REPLICA IDENTITY FULL;
ALTER TABLE public.review_reports REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reviews;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.review_votes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.review_reports;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. Storage bucket for review media (images + videos)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-media', 'review-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "review media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'review-media');
CREATE POLICY "review media user upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'review-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "review media user delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'review-media' AND (auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','support']::app_role[])));