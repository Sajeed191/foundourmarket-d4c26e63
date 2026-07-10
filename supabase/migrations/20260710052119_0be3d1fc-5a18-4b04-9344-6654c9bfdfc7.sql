DROP POLICY IF EXISTS "Users manage own support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff read support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own support attachments" ON storage.objects;

CREATE POLICY "support-attachments insert own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "support-attachments select own or staff"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role, 'manager'::app_role, 'support'::app_role])
  )
);

CREATE POLICY "support-attachments update own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "support-attachments delete own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);