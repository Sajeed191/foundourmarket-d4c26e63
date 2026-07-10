-- Replace the fragile subquery-based WITH CHECK on profiles UPDATE.
-- Sensitive-field freezing is already enforced robustly by BEFORE UPDATE
-- triggers (guard_profile_admin_fields_trg, enforce_region_lock), which
-- compare OLD vs NEW directly and raise on unauthorized changes by non-staff.
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);