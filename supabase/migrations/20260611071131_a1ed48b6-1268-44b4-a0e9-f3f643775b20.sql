-- 1. Stop public direct reads of product_questions that leak customer user_id.
--    Public Q&A is served via the SECURITY DEFINER get_product_questions() RPC,
--    which returns only safe columns (question, answer, product_slug, is_mine).
DROP POLICY IF EXISTS "public read answered questions" ON public.product_questions;

-- 2. Stop broadcasting sensitive cost/margin/operational columns over Realtime.
--    Re-publish products with an explicit safe column list that excludes the
--    internal-only fields. Column-list publications require a non-FULL replica
--    identity, so use the primary key (DEFAULT).
ALTER TABLE public.products REPLICA IDENTITY DEFAULT;

ALTER PUBLICATION supabase_realtime DROP TABLE public.products;

DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'products'
    AND column_name NOT IN (
      'cost', 'cost_price_inr', 'cost_price_usd', 'revenue',
      'admin_notes', 'warehouse_location', 'restock_eta'
    );
  EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.products (%s)', cols);
END $$;