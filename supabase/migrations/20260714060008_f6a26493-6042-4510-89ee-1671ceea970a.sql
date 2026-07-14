-- Perceptual image hash for duplicate image detection
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_phash text;

-- Duplicate detection events (ignore history + learning signals + dashboard)
CREATE TABLE IF NOT EXISTS public.duplicate_detection_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid REFERENCES auth.users ON DELETE SET NULL,
  draft_signature text NOT NULL,
  draft_name text,
  draft_brand text,
  draft_category text,
  candidate_slug text,
  candidate_name text,
  candidate_category text,
  candidate_brand text,
  action text NOT NULL CHECK (action IN ('ignored','merged','created_anyway','confirmed')),
  score integer NOT NULL DEFAULT 0,
  verdict text,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dup_events_signature ON public.duplicate_detection_events (draft_signature);
CREATE INDEX IF NOT EXISTS idx_dup_events_candidate ON public.duplicate_detection_events (candidate_slug);
CREATE INDEX IF NOT EXISTS idx_dup_events_action ON public.duplicate_detection_events (action);
CREATE INDEX IF NOT EXISTS idx_dup_events_created ON public.duplicate_detection_events (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_detection_events TO authenticated;
GRANT ALL ON public.duplicate_detection_events TO service_role;

ALTER TABLE public.duplicate_detection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view duplicate events"
  ON public.duplicate_detection_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Staff can insert duplicate events"
  ON public.duplicate_detection_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Staff can update duplicate events"
  ON public.duplicate_detection_events FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Staff can delete duplicate events"
  ON public.duplicate_detection_events FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'manager')
  );