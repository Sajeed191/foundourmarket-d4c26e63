CREATE TABLE public.storefront_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  region text NOT NULL DEFAULT 'all' CHECK (region IN ('all','india','international')),
  publish_at timestamptz,
  unpublish_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.storefront_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_blocks TO authenticated;
GRANT ALL ON public.storefront_blocks TO service_role;

ALTER TABLE public.storefront_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storefront blocks public read published"
ON public.storefront_blocks FOR SELECT
USING (status = 'published' AND active = true);

CREATE POLICY "storefront blocks staff read all"
ON public.storefront_blocks FOR SELECT
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

CREATE POLICY "storefront blocks staff insert"
ON public.storefront_blocks FOR INSERT
TO authenticated
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

CREATE POLICY "storefront blocks staff update"
ON public.storefront_blocks FOR UPDATE
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

CREATE POLICY "storefront blocks staff delete"
ON public.storefront_blocks FOR DELETE
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'editor'::app_role]));

CREATE INDEX idx_storefront_blocks_order ON public.storefront_blocks (status, sort_order);

CREATE TRIGGER update_storefront_blocks_updated_at
BEFORE UPDATE ON public.storefront_blocks
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.storefront_blocks;