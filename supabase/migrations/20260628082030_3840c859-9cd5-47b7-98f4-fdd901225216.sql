-- Allow public (anon + authenticated) to read only non-deleted product questions.
-- Write operations remain restricted to owners and staff (existing policies unchanged).
CREATE POLICY "public read published questions"
ON public.product_questions
FOR SELECT
TO anon, authenticated
USING (deleted_at IS NULL);

-- Ensure anon has SELECT grant on the table (read-only); writes are not granted to anon.
GRANT SELECT ON public.product_questions TO anon;