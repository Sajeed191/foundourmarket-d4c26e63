
-- 1. Add a maintained plain-text column used for fuzzy/partial/typo matching.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_text text;

-- 2. Rebuild the search vector + search_text trigger to cover more fields.
CREATE OR REPLACE FUNCTION public.products_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.brand,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.tagline,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.category,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.collection,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '),'')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.meta_keywords, ' '),'')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.description,'')), 'C');

  NEW.search_text := lower(concat_ws(' ',
    NEW.name, NEW.brand, NEW.tagline, NEW.category, NEW.collection,
    array_to_string(NEW.tags, ' '),
    array_to_string(NEW.meta_keywords, ' ')
  ));
  RETURN NEW;
END $function$;

-- 3. Backfill existing rows.
UPDATE public.products SET name = name;

-- 4. Trigram index for fuzzy/partial matching.
CREATE INDEX IF NOT EXISTS idx_products_search_text_trgm
  ON public.products USING gin (search_text gin_trgm_ops);

-- 5. Smarter ranked search: full-text (with prefix) + trigram fuzzy fallback.
CREATE OR REPLACE FUNCTION public.search_products(
  q text DEFAULT NULL::text,
  category_filter text DEFAULT NULL::text,
  min_price numeric DEFAULT NULL::numeric,
  max_price numeric DEFAULT NULL::numeric,
  min_rating numeric DEFAULT NULL::numeric,
  sort_by text DEFAULT 'relevance'::text,
  page_limit integer DEFAULT 24,
  page_offset integer DEFAULT 0
)
RETURNS SETOF products
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ts_q tsquery;
  cat_slugs text[];
  cat_id uuid;
  norm_q text;
  word text;
  prefix_q text;
BEGIN
  IF q IS NOT NULL AND length(trim(q)) > 0 THEN
    norm_q := lower(trim(q));
    -- Base full-text query (handles stemming -> singular/plural).
    ts_q := websearch_to_tsquery('english', q);

    -- Add prefix matching for partial words ("ba" -> "bag").
    prefix_q := '';
    FOR word IN
      SELECT m[1] FROM regexp_matches(norm_q, '[a-z0-9]+', 'g') AS m
    LOOP
      IF length(prefix_q) > 0 THEN
        prefix_q := prefix_q || ' & ';
      END IF;
      prefix_q := prefix_q || word || ':*';
    END LOOP;

    IF length(prefix_q) > 0 THEN
      ts_q := ts_q || to_tsquery('english', prefix_q);
    END IF;
  END IF;

  IF category_filter IS NOT NULL THEN
    SELECT c.id INTO cat_id FROM public.categories c WHERE c.slug = category_filter;
    IF cat_id IS NOT NULL THEN
      SELECT array_agg(s) INTO cat_slugs
      FROM (
        SELECT category_filter AS s
        UNION
        SELECT c.slug FROM public.categories c WHERE c.parent_id = cat_id
      ) sub;
    ELSE
      cat_slugs := ARRAY[category_filter];
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.* FROM public.products p
  WHERE (
      norm_q IS NULL
      OR (ts_q IS NOT NULL AND p.search_vector @@ ts_q)
      OR p.search_text % norm_q                     -- trigram similarity (typos)
      OR p.search_text ILIKE '%' || norm_q || '%'   -- raw substring
    )
    AND (cat_slugs IS NULL OR p.category = ANY(cat_slugs))
    AND (min_price IS NULL OR p.price >= min_price)
    AND (max_price IS NULL OR p.price <= max_price)
    AND (min_rating IS NULL OR p.rating >= min_rating)
  ORDER BY
    CASE WHEN sort_by = 'relevance' AND norm_q IS NOT NULL THEN
      (CASE WHEN ts_q IS NOT NULL AND p.search_vector @@ ts_q THEN ts_rank(p.search_vector, ts_q) ELSE 0 END)
      + similarity(p.search_text, norm_q)
      + (CASE WHEN p.search_text ILIKE norm_q || '%' THEN 0.5 ELSE 0 END)
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'price_asc' THEN p.price END ASC,
    CASE WHEN sort_by = 'price_desc' THEN p.price END DESC,
    CASE WHEN sort_by = 'rating' THEN p.rating END DESC,
    CASE WHEN sort_by = 'newest' THEN p.created_at END DESC,
    p.sort_order ASC
  LIMIT page_limit OFFSET page_offset;
END $function$;

-- 6. "Did you mean...?" suggestion helper.
CREATE OR REPLACE FUNCTION public.suggest_search_term(q text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  norm_q text;
  suggestion text;
BEGIN
  IF q IS NULL OR length(trim(q)) = 0 THEN
    RETURN NULL;
  END IF;
  norm_q := lower(trim(q));

  SELECT term INTO suggestion
  FROM (
    SELECT lower(brand) AS term FROM public.products WHERE brand IS NOT NULL AND length(brand) > 1
    UNION
    SELECT lower(category) FROM public.products WHERE category IS NOT NULL
    UNION
    SELECT lower(name) FROM public.products WHERE name IS NOT NULL
  ) terms
  WHERE term <> norm_q AND similarity(term, norm_q) > 0.2
  ORDER BY similarity(term, norm_q) DESC
  LIMIT 1;

  RETURN suggestion;
END $function$;

GRANT EXECUTE ON FUNCTION public.suggest_search_term(text) TO anon, authenticated, service_role;
