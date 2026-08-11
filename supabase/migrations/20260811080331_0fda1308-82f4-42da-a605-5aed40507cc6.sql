CREATE POLICY "meas_manager_insert" ON public.measurements
FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'manager'::app_role));