ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS resolution_type text NOT NULL DEFAULT 'replacement',
  ADD COLUMN IF NOT EXISTS replacement_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS replacement_order_id uuid;

ALTER TABLE public.returns
  DROP CONSTRAINT IF EXISTS returns_resolution_type_check;
ALTER TABLE public.returns
  ADD CONSTRAINT returns_resolution_type_check CHECK (resolution_type IN ('replacement','refund'));

ALTER TABLE public.returns
  DROP CONSTRAINT IF EXISTS returns_replacement_status_check;
ALTER TABLE public.returns
  ADD CONSTRAINT returns_replacement_status_check CHECK (replacement_status IN ('pending','approved','processing','shipped','delivered'));