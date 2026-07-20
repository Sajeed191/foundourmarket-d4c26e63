DROP POLICY IF EXISTS "assignments insert" ON public.experiment_assignments;

CREATE POLICY "assignments insert own or anon"
ON public.experiment_assignments
FOR INSERT
TO public
WITH CHECK (user_id IS NULL OR user_id = auth.uid());