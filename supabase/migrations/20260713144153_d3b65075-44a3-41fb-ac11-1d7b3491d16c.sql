-- Priority 1 & 2: Commerce graph + precomputed scores (public read caches)

CREATE TABLE public.product_graph_edges (
  from_slug   text NOT NULL,
  edge_type   text NOT NULL,
  to_slug     text NOT NULL,
  weight      numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_slug, edge_type, to_slug),
  CONSTRAINT product_graph_edges_type_chk CHECK (edge_type IN
    ('bought_with','viewed_with','similar_to','upgrade_to','budget_alt','accessory_of','same_brand','same_category'))
);
CREATE INDEX idx_product_graph_edges_lookup ON public.product_graph_edges (from_slug, edge_type, weight DESC);

GRANT SELECT ON public.product_graph_edges TO anon, authenticated;
GRANT ALL ON public.product_graph_edges TO service_role;
ALTER TABLE public.product_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "graph edges public read" ON public.product_graph_edges FOR SELECT USING (true);
CREATE POLICY "graph edges admin write" ON public.product_graph_edges FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.product_scores (
  product_slug   text PRIMARY KEY,
  trending       numeric NOT NULL DEFAULT 0,
  popularity     numeric NOT NULL DEFAULT 0,
  conversion     numeric NOT NULL DEFAULT 0,
  fbt_strength   numeric NOT NULL DEFAULT 0,
  aggregates     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_scores TO anon, authenticated;
GRANT ALL ON public.product_scores TO service_role;
ALTER TABLE public.product_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product scores public read" ON public.product_scores FOR SELECT USING (true);
CREATE POLICY "product scores admin write" ON public.product_scores FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));