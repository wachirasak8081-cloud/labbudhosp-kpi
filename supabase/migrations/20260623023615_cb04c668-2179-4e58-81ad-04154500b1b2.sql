-- Phase 6: Add staff write policies for corrective_actions
-- Spec: staff INSERT only for indicators of their own department, UPDATE only rows they created (and not yet closed)

CREATE POLICY capa_staff_insert ON public.corrective_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'staff')
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = corrective_actions.indicator_id
        AND i.department_id IS NOT DISTINCT FROM private.current_user_department()
    )
  );

CREATE POLICY capa_staff_update_own ON public.corrective_actions
  FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'staff')
    AND created_by = auth.uid()
    AND status <> 'closed'
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'staff')
    AND created_by = auth.uid()
  );