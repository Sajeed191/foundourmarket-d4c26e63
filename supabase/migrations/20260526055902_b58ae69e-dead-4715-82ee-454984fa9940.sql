CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_slug, user_id)
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews viewable by everyone" ON public.product_reviews
  FOR SELECT USING (true);

CREATE POLICY "own review insert" ON public.product_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own review update" ON public.product_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "own review delete" ON public.product_reviews
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Validate rating range via trigger (avoid CHECK constraint per guidelines)
CREATE OR REPLACE FUNCTION public.validate_review_rating()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER product_reviews_validate_rating
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_rating();

-- Recompute product aggregates
CREATE OR REPLACE FUNCTION public.refresh_product_rating(_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products p
  SET rating = COALESCE(agg.avg_rating, 0),
      reviews = COALESCE(agg.cnt, 0)
  FROM (
    SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*) AS cnt
    FROM public.product_reviews WHERE product_slug = _slug
  ) agg
  WHERE p.slug = _slug;
END; $$;

CREATE OR REPLACE FUNCTION public.on_review_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_rating(OLD.product_slug);
    RETURN OLD;
  ELSE
    PERFORM public.refresh_product_rating(NEW.product_slug);
    IF TG_OP = 'UPDATE' AND OLD.product_slug <> NEW.product_slug THEN
      PERFORM public.refresh_product_rating(OLD.product_slug);
    END IF;
    RETURN NEW;
  END IF;
END; $$;

CREATE TRIGGER product_reviews_refresh_aggregate
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.on_review_change();

CREATE INDEX idx_product_reviews_slug ON public.product_reviews(product_slug);
CREATE INDEX idx_product_reviews_user ON public.product_reviews(user_id);