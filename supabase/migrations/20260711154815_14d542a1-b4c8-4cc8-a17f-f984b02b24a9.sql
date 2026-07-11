DROP POLICY IF EXISTS "review media public read" ON storage.objects;

CREATE POLICY "review media public read" ON storage.objects
FOR SELECT
USING (
  (bucket_id = 'review-media'::text)
  AND (name IS NOT NULL)
  AND (
    (EXISTS (
      SELECT 1
      FROM product_reviews pr
      WHERE (
        pr.status = 'published'::text
        AND pr.deleted_at IS NULL
        AND pr.user_id IS NOT NULL
        -- the file must live in the review author's own folder (anchored ownership check)
        AND (pr.user_id)::text = (storage.foldername(objects.name))[1]
        AND jsonb_typeof(pr.media) = 'array'::text
        AND (EXISTS (
          SELECT 1
          FROM jsonb_array_elements(pr.media) m(value)
          WHERE (m.value ->> 'url'::text) LIKE ('%/review-media/' || objects.name)
        ))
      )
    ))
    OR ((auth.uid())::text = (storage.foldername(name))[1])
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role])
  )
);