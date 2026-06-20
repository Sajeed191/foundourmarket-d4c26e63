CREATE POLICY "own rec events delete"
ON public.recommendation_events
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);