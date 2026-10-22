-- Keep the Civil ID image bucket private and enforce upload constraints.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('civil-ids', 'civil-ids', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Approved staff read civil ids" ON storage.objects;
DROP POLICY IF EXISTS "Approved staff upload civil ids" ON storage.objects;
DROP POLICY IF EXISTS "Approved staff update civil ids" ON storage.objects;
DROP POLICY IF EXISTS "Approved staff delete civil ids" ON storage.objects;

CREATE POLICY "Approved staff read civil ids"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved staff upload civil ids"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved staff update civil ids"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()))
  WITH CHECK (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
CREATE POLICY "Approved staff delete civil ids"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'civil-ids' AND public.is_approved(auth.uid()));
