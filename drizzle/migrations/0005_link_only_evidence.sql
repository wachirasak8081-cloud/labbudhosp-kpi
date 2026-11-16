DROP POLICY IF EXISTS evidence_insert ON public.measurement_evidence;
CREATE POLICY evidence_insert ON public.measurement_evidence FOR INSERT TO authenticated WITH CHECK (
  uploaded_by=auth.uid()
  AND mime_type='link/url'
  AND EXISTS (SELECT 1 FROM public.measurements m JOIN public.indicators i ON i.id=m.indicator_id WHERE m.id=measurement_id AND (private.has_role(auth.uid(),'admin') OR (m.status<>'approved' AND (private.has_role(auth.uid(),'manager') OR (private.has_role(auth.uid(),'staff') AND i.department_id=private.current_user_department())))))
);
DROP POLICY IF EXISTS measurement_evidence_storage_insert ON storage.objects;