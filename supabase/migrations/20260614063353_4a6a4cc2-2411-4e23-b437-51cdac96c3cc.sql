CREATE OR REPLACE FUNCTION public.guard_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff boolean;
BEGIN
  -- Determine if the current user is staff (allowed to change admin-managed fields)
  is_staff := public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'support');

  -- service_role / unauthenticated server contexts (no auth.uid) bypass this guard
  IF auth.uid() IS NULL OR is_staff THEN
    RETURN NEW;
  END IF;

  -- Non-staff users may not change administrative / lifecycle fields on their profile
  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
     OR NEW.ordering_blocked IS DISTINCT FROM OLD.ordering_blocked
     OR NEW.reviews_disabled IS DISTINCT FROM OLD.reviews_disabled
     OR NEW.tier_override IS DISTINCT FROM OLD.tier_override
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.is_seeded IS DISTINCT FROM OLD.is_seeded
     OR NEW.region_locked_at IS DISTINCT FROM OLD.region_locked_at
     OR NEW.market_region IS DISTINCT FROM OLD.market_region
  THEN
    RAISE EXCEPTION 'You are not allowed to modify administrative profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_admin_fields_trg ON public.profiles;
CREATE TRIGGER guard_profile_admin_fields_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_admin_fields();