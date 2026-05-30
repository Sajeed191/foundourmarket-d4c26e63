-- ============ EDITOR DRAFTS (autosave / crash recovery) ============
CREATE TABLE public.editor_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT 'new',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_snapshot jsonb,
  status text NOT NULL DEFAULT 'draft',
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.editor_drafts TO authenticated;
GRANT ALL ON public.editor_drafts TO service_role;

ALTER TABLE public.editor_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage own drafts"
ON public.editor_drafts FOR ALL
TO authenticated
USING (auth.uid() = user_id AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support','warehouse_staff']::app_role[]))
WITH CHECK (auth.uid() = user_id AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support','warehouse_staff']::app_role[]));

CREATE INDEX idx_editor_drafts_user ON public.editor_drafts (user_id, updated_at DESC);
CREATE INDEX idx_editor_drafts_entity ON public.editor_drafts (entity_type, entity_id);

CREATE TRIGGER trg_editor_drafts_updated
BEFORE UPDATE ON public.editor_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ENTITY VERSIONS (universal version history) ============
CREATE TABLE public.entity_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  summary text,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.entity_versions TO authenticated;
GRANT ALL ON public.entity_versions TO service_role;

ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read entity versions"
ON public.entity_versions FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support']::app_role[]));

CREATE POLICY "Staff insert entity versions"
ON public.entity_versions FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]));

CREATE INDEX idx_entity_versions_entity ON public.entity_versions (entity_type, entity_id, created_at DESC);

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.upsert_editor_draft(
  _entity_type text, _entity_id text, _data jsonb,
  _base_snapshot jsonb DEFAULT NULL, _status text DEFAULT 'draft', _device_label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.editor_drafts(user_id, entity_type, entity_id, data, base_snapshot, status, device_label)
  VALUES (auth.uid(), _entity_type, COALESCE(_entity_id,'new'), COALESCE(_data,'{}'::jsonb), _base_snapshot, COALESCE(_status,'draft'), _device_label)
  ON CONFLICT (user_id, entity_type, entity_id)
  DO UPDATE SET data = EXCLUDED.data,
                base_snapshot = COALESCE(EXCLUDED.base_snapshot, public.editor_drafts.base_snapshot),
                status = EXCLUDED.status,
                device_label = COALESCE(EXCLUDED.device_label, public.editor_drafts.device_label),
                updated_at = now()
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.discard_editor_draft(_entity_type text, _entity_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM public.editor_drafts
  WHERE user_id = auth.uid() AND entity_type = _entity_type AND entity_id = COALESCE(_entity_id,'new');
END $$;

CREATE OR REPLACE FUNCTION public.save_entity_version(
  _entity_type text, _entity_id text, _snapshot jsonb,
  _changed_fields text[] DEFAULT '{}', _summary text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.entity_versions(entity_type, entity_id, snapshot, changed_fields, summary, edited_by)
  VALUES (_entity_type, _entity_id, _snapshot, COALESCE(_changed_fields,'{}'), _summary, auth.uid())
  RETURNING id INTO new_id;
  -- prune to latest 50 per entity
  DELETE FROM public.entity_versions
  WHERE id IN (
    SELECT id FROM public.entity_versions
    WHERE entity_type = _entity_type AND entity_id = _entity_id
    ORDER BY created_at DESC OFFSET 50
  );
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.log_admin_activity(
  _action text, _entity_type text DEFAULT NULL, _entity_id text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_id bigint;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','super_admin','manager','editor','support','warehouse_staff']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.admin_activity_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;