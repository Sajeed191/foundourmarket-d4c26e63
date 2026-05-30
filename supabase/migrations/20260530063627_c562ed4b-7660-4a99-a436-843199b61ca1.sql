-- ============================================================
-- ADVANCED MEDIA MANAGEMENT SYSTEM
-- ============================================================

-- Shared public media bucket (reusable library engine)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for the shared media bucket
CREATE POLICY "media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'media');

CREATE POLICY "media admin insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "media admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "media admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

-- ============================================================
-- media_assets: the reusable media library
-- ============================================================
CREATE TABLE public.media_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket text NOT NULL DEFAULT 'media',
  path text NOT NULL,
  url text NOT NULL,
  thumb_url text,
  medium_url text,
  large_url text,
  alt text,
  original_name text,
  mime text,
  width integer,
  height integer,
  size_bytes bigint,
  entity_type text NOT NULL DEFAULT 'library',
  entity_ref text,
  tags text[] NOT NULL DEFAULT '{}',
  usage_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_assets staff read"
ON public.media_assets FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support']::app_role[]));

CREATE POLICY "media_assets staff insert"
ON public.media_assets FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "media_assets staff update"
ON public.media_assets FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE POLICY "media_assets staff delete"
ON public.media_assets FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE INDEX idx_media_assets_entity ON public.media_assets (entity_type, created_at DESC);
CREATE INDEX idx_media_assets_created ON public.media_assets (created_at DESC);
CREATE INDEX idx_media_assets_tags ON public.media_assets USING GIN (tags);
CREATE INDEX idx_media_assets_name ON public.media_assets USING GIN (to_tsvector('english', coalesce(original_name,'') || ' ' || coalesce(alt,'')));

CREATE TRIGGER trg_media_assets_updated
BEFORE UPDATE ON public.media_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- media_audit_logs
-- ============================================================
CREATE TABLE public.media_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_ref text,
  actor_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.media_audit_logs TO authenticated;
GRANT ALL ON public.media_audit_logs TO service_role;

ALTER TABLE public.media_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_audit staff read"
ON public.media_audit_logs FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support']::app_role[]));

CREATE POLICY "media_audit staff insert"
ON public.media_audit_logs FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE INDEX idx_media_audit_created ON public.media_audit_logs (created_at DESC);
CREATE INDEX idx_media_audit_asset ON public.media_audit_logs (asset_id);

-- ============================================================
-- log_media_event RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_media_event(
  _action text,
  _asset_id uuid DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_ref text DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.media_audit_logs(asset_id, action, entity_type, entity_ref, actor_id, meta)
  VALUES (_asset_id, _action, _entity_type, _entity_ref, auth.uid(), COALESCE(_meta,'{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- ============================================================
-- media_library_search RPC (pagination + filter + search)
-- ============================================================
CREATE OR REPLACE FUNCTION public.media_library_search(
  _q text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _limit integer DEFAULT 40,
  _offset integer DEFAULT 0
) RETURNS SETOF public.media_assets
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.media_assets m
  WHERE (_entity_type IS NULL OR _entity_type = 'all' OR m.entity_type = _entity_type)
    AND (
      _q IS NULL OR length(trim(_q)) = 0
      OR m.original_name ILIKE '%'||_q||'%'
      OR m.alt ILIKE '%'||_q||'%'
      OR EXISTS (SELECT 1 FROM unnest(m.tags) t WHERE t ILIKE '%'||_q||'%')
    )
  ORDER BY m.created_at DESC
  LIMIT LEAST(_limit, 100) OFFSET _offset;
$$;
