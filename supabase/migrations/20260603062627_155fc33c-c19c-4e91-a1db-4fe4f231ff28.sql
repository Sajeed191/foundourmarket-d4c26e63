-- Product Rating Management: initial/imported ratings + audit history + auto recalculation

-- 1. Add imported/initial rating fields to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS initial_rating numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_source text NOT NULL DEFAULT 'customer_reviews';

-- Constrain rating_source to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_rating_source_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_rating_source_check
      CHECK (rating_source IN ('customer_reviews', 'imported_supplier', 'marketplace_imported'));
  END IF;
END $$;

-- 2. Audit history table for every rating change
CREATE TABLE IF NOT EXISTS public.product_rating_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_slug text NOT NULL,
  admin_id uuid,
  action text NOT NULL,
  initial_rating numeric,
  initial_review_count integer,
  rating_source text,
  final_rating numeric,
  total_reviews integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_rating_audit TO authenticated;
GRANT ALL ON public.product_rating_audit TO service_role;

ALTER TABLE public.product_rating_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read rating audit"
ON public.product_rating_audit
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Staff can insert rating audit"
ON public.product_rating_audit
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE INDEX IF NOT EXISTS idx_product_rating_audit_slug
  ON public.product_rating_audit (product_slug, created_at DESC);

-- 3. Recalculation function: blends imported rating with authentic customer reviews
CREATE OR REPLACE FUNCTION public.recalculate_product_rating(_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initial_rating numeric;
  v_initial_count integer;
  v_customer_count integer;
  v_customer_avg numeric;
  v_total integer;
  v_final numeric;
BEGIN
  SELECT initial_rating, initial_review_count
    INTO v_initial_rating, v_initial_count
  FROM public.products
  WHERE slug = _slug;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(AVG(rating), 0)
    INTO v_customer_count, v_customer_avg
  FROM public.product_reviews
  WHERE product_slug = _slug
    AND status = 'published'
    AND COALESCE(is_seeded, false) = false;

  v_total := COALESCE(v_initial_count, 0) + COALESCE(v_customer_count, 0);

  IF v_total = 0 THEN
    v_final := 0;
  ELSE
    v_final := (
      (COALESCE(v_initial_rating, 0) * COALESCE(v_initial_count, 0))
      + (COALESCE(v_customer_avg, 0) * COALESCE(v_customer_count, 0))
    ) / v_total;
  END IF;

  UPDATE public.products
  SET rating = ROUND(v_final, 2),
      reviews = v_total,
      updated_at = now()
  WHERE slug = _slug;
END;
$$;

-- 4. Trigger to auto-recalc when customer reviews change
CREATE OR REPLACE FUNCTION public.trg_recalc_product_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.recalculate_product_rating(OLD.product_slug);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_product_rating(NEW.product_slug);
    IF (TG_OP = 'UPDATE' AND NEW.product_slug IS DISTINCT FROM OLD.product_slug) THEN
      PERFORM public.recalculate_product_rating(OLD.product_slug);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recalc_product_rating ON public.product_reviews;
CREATE TRIGGER recalc_product_rating
AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalc_product_rating();