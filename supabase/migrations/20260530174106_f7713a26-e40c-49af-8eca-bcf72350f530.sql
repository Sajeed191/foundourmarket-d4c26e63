-- ============================================================
-- Region assignment history
-- ============================================================
CREATE TABLE public.region_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  region text NOT NULL,
  previous_region text,
  method text NOT NULL DEFAULT 'auto',
  assigned_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.region_assignment_history TO authenticated;
GRANT ALL ON public.region_assignment_history TO service_role;

ALTER TABLE public.region_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or staff region history"
ON public.region_assignment_history
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE INDEX idx_region_history_user ON public.region_assignment_history(user_id, created_at DESC);

-- ============================================================
-- Region change requests
-- ============================================================
CREATE TABLE public.region_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  current_region text,
  requested_region text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  review_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.region_change_requests TO authenticated;
GRANT ALL ON public.region_change_requests TO service_role;

ALTER TABLE public.region_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or staff region requests"
ON public.region_change_requests
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Create own region request"
ON public.region_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND requested_region IN ('india', 'international')
  AND status = 'pending'
);

CREATE INDEX idx_region_requests_status ON public.region_change_requests(status, created_at DESC);
CREATE INDEX idx_region_requests_user ON public.region_change_requests(user_id, created_at DESC);

CREATE TRIGGER region_requests_set_updated_at
BEFORE UPDATE ON public.region_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Allow staff override in the lock trigger (customers still locked)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_region_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.market_region IS NOT NULL
     AND NEW.market_region NOT IN ('india','international') THEN
    RAISE EXCEPTION 'market_region must be india or international';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Once locked, region can only change through a trusted override routine
    IF OLD.market_region IS NOT NULL
       AND NEW.market_region IS DISTINCT FROM OLD.market_region THEN
      IF COALESCE(current_setting('app.allow_region_change', true), '') <> '1' THEN
        RAISE EXCEPTION 'market_region is locked and cannot be changed';
      END IF;
    END IF;
    -- Stamp the lock time when first assigned
    IF OLD.market_region IS NULL AND NEW.market_region IS NOT NULL
       AND NEW.region_locked_at IS NULL THEN
      NEW.region_locked_at := now();
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.market_region IS NOT NULL AND NEW.region_locked_at IS NULL THEN
      NEW.region_locked_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- ============================================================
-- Automatically log every region assignment to history
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_region_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.market_region IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.market_region IS DISTINCT FROM OLD.market_region) THEN
    INSERT INTO public.region_assignment_history
      (user_id, region, previous_region, method, assigned_by, reason)
    VALUES (
      NEW.id,
      NEW.market_region,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.market_region ELSE NULL END,
      COALESCE(NULLIF(current_setting('app.region_method', true), ''), 'auto'),
      NULLIF(current_setting('app.region_actor', true), '')::uuid,
      NULLIF(current_setting('app.region_reason', true), '')
    );
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_log_region_assignment
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_region_assignment();

-- ============================================================
-- Self-assignment routine (storefront first lock / detection)
-- ============================================================
CREATE OR REPLACE FUNCTION public.self_lock_region(
  _region text,
  _country text DEFAULT NULL,
  _method text DEFAULT 'self'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _region NOT IN ('india','international') THEN
    RAISE EXCEPTION 'invalid region';
  END IF;

  SELECT market_region INTO existing FROM public.profiles WHERE id = uid;
  IF existing IS NOT NULL THEN
    -- Already locked: never overwrite via the self path
    RETURN existing;
  END IF;

  PERFORM set_config('app.region_method', COALESCE(_method, 'self'), true);
  PERFORM set_config('app.region_actor', uid::text, true);
  PERFORM set_config('app.region_reason', 'Customer selection / auto-detected', true);

  UPDATE public.profiles
  SET market_region = _region,
      country_code = COALESCE(_country, country_code),
      region_locked_at = COALESCE(region_locked_at, now()),
      updated_at = now()
  WHERE id = uid;

  RETURN _region;
END $function$;

REVOKE EXECUTE ON FUNCTION public.self_lock_region(text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_lock_region(text, text, text) TO authenticated, service_role;

-- ============================================================
-- Staff override routine
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_change_region(
  _actor uuid,
  _target uuid,
  _region text,
  _reason text DEFAULT NULL,
  _method text DEFAULT 'admin'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(_actor, 'admin')
    OR public.has_role(_actor, 'super_admin')
    OR public.has_role(_actor, 'manager')
  ) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  IF _region NOT IN ('india','international') THEN
    RAISE EXCEPTION 'invalid region';
  END IF;

  PERFORM set_config('app.allow_region_change', '1', true);
  PERFORM set_config('app.region_method', COALESCE(_method, 'admin'), true);
  PERFORM set_config('app.region_actor', _actor::text, true);
  PERFORM set_config('app.region_reason', COALESCE(_reason, ''), true);

  UPDATE public.profiles
  SET market_region = _region,
      region_locked_at = COALESCE(region_locked_at, now()),
      updated_at = now()
  WHERE id = _target;

  INSERT INTO public.security_audit_log
    (actor_id, actor_role, action, target, success, detail)
  VALUES (
    _actor, 'staff', 'region.change', _target::text, true,
    jsonb_build_object('region', _region, 'reason', _reason, 'method', _method)
  );

  RETURN _region;
END $function$;

REVOKE EXECUTE ON FUNCTION public.admin_change_region(uuid, uuid, text, text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_region(uuid, uuid, text, text, text) TO service_role;