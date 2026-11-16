DROP POLICY IF EXISTS measurement_evidence_storage_read ON storage.objects;
CREATE POLICY measurement_evidence_storage_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'measurement-evidence' AND auth.uid() IS NOT NULL AND (
    owner = auth.uid()
    OR private.has_role(auth.uid(),'admin')
    OR private.has_role(auth.uid(),'manager')
    OR private.has_role(auth.uid(),'auditor')
    OR EXISTS (SELECT 1 FROM public.measurement_evidence e WHERE e.storage_path = objects.name AND e.uploaded_by = auth.uid())
  ));