CREATE POLICY "Users manage own return photos - select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'return-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users manage own return photos - insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'return-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users manage own return photos - delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'return-photos' AND (storage.foldername(name))[1] = auth.uid()::text);