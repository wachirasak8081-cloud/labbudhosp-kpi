DROP POLICY IF EXISTS th_read ON public.target_history;
CREATE POLICY th_read ON public.target_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS annual_summary_read_authenticated ON public.annual_objective_summary;
CREATE POLICY annual_summary_read_authenticated ON public.annual_objective_summary FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS ind_read ON public.indicators;
CREATE POLICY ind_read ON public.indicators FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS dept_read ON public.departments;
CREATE POLICY dept_read ON public.departments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS measurement_evidence_storage_read ON storage.objects;
CREATE POLICY measurement_evidence_storage_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'measurement-evidence' AND auth.uid() IS NOT NULL AND (
    owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.measurement_evidence e JOIN public.measurements m ON m.id = e.measurement_id
               WHERE e.storage_path = objects.name AND (m.id)::text = (storage.foldername(objects.name))[1])
  ));