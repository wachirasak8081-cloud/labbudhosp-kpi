
CREATE POLICY "capa_docs_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'capa-docs');
CREATE POLICY "capa_docs_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'capa-docs');
CREATE POLICY "capa_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'capa-docs' AND (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR owner = auth.uid()));
CREATE POLICY "capa_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'capa-docs' AND (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR owner = auth.uid()));
