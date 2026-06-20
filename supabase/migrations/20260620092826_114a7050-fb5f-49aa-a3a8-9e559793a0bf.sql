ALTER TABLE public.recommendation_events
  DROP CONSTRAINT IF EXISTS recommendation_events_event_type_check;

ALTER TABLE public.recommendation_events
  ADD CONSTRAINT recommendation_events_event_type_check
  CHECK (event_type IN ('view','add_to_cart','purchase','wishlist','search','category_view','begin_checkout'));