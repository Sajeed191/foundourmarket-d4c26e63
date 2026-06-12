-- Fix 1: product_reviews — restrict Realtime broadcast to the safe public column set
-- (mirrors the product_reviews_public view). Excludes moderation/internal columns:
-- is_seeded, report_count, is_flagged, admin_reply_by, sentiment, sentiment_score,
-- sentiment_summary, sentiment_analyzed_at, fake_score, fake_reasons, moderation_analyzed_at.
ALTER PUBLICATION supabase_realtime DROP TABLE public.product_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reviews
  (id, product_slug, user_id, rating, title, body, media, status, pinned, featured,
   verified_purchase, helpful_count, not_helpful_count, admin_reply, admin_reply_at,
   created_at, updated_at);

-- Fix 2: support_internal_notes — staff-only; remove from Realtime entirely so it can
-- never be delivered to customers subscribed to a shared support-thread topic.
ALTER PUBLICATION supabase_realtime DROP TABLE public.support_internal_notes;