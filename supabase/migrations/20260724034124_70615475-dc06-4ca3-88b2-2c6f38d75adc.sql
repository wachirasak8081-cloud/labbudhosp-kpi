
-- Tighten read policies to enforce department-scoped access for staff/auditor while
-- keeping admin and manager visibility.

-- measurements: staff limited to own department's indicators; auditor read-only all
DROP POLICY IF EXISTS meas_read ON public.measurements;
CREATE POLICY meas_read ON public.measurements
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
    OR (
      private.has_role(auth.uid(), 'staff'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.indicators i
        WHERE i.id = measurements.indicator_id
          AND i.department_id = private.current_user_department()
      )
    )
  );

-- corrective_actions: staff limited to own dept or self-created
DROP POLICY IF EXISTS capa_read ON public.corrective_actions;
CREATE POLICY capa_read ON public.corrective_actions
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
    OR (
      private.has_role(auth.uid(), 'staff'::app_role)
      AND (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.indicators i
          WHERE i.id = corrective_actions.indicator_id
            AND i.department_id = private.current_user_department()
        )
      )
    )
  );

-- capa_documents: staff restricted to docs they uploaded or linked to their department's indicators
DROP POLICY IF EXISTS doc_read ON public.capa_documents;
CREATE POLICY doc_read ON public.capa_documents
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
    OR uploaded_by = auth.uid()
    OR (
      private.has_role(auth.uid(), 'staff'::app_role)
      AND related_indicator_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.indicators i
        WHERE i.id = capa_documents.related_indicator_id
          AND i.department_id = private.current_user_department()
      )
    )
  );

-- capa_attachments: derive access via parent corrective_action's indicator department
DROP POLICY IF EXISTS att_read ON public.capa_attachments;
CREATE POLICY att_read ON public.capa_attachments
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
    OR uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.corrective_actions ca
      JOIN public.indicators i ON i.id = ca.indicator_id
      WHERE ca.id = capa_attachments.capa_id
        AND (
          ca.created_by = auth.uid()
          OR (
            private.has_role(auth.uid(), 'staff'::app_role)
            AND i.department_id = private.current_user_department()
          )
        )
    )
  );

-- capa_comments: same access model as attachments
DROP POLICY IF EXISTS cmt_read ON public.capa_comments;
CREATE POLICY cmt_read ON public.capa_comments
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'manager'::app_role)
    OR private.has_role(auth.uid(), 'auditor'::app_role)
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.corrective_actions ca
      JOIN public.indicators i ON i.id = ca.indicator_id
      WHERE ca.id = capa_comments.capa_id
        AND (
          ca.created_by = auth.uid()
          OR (
            private.has_role(auth.uid(), 'staff'::app_role)
            AND i.department_id = private.current_user_department()
          )
        )
    )
  );

-- Storage: capa-docs bucket read restricted to users with access to the related capa record
DROP POLICY IF EXISTS capa_docs_read ON storage.objects;
CREATE POLICY capa_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'capa-docs'
    AND (
      private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'manager'::app_role)
      OR private.has_role(auth.uid(), 'auditor'::app_role)
      OR owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.capa_attachments a
        JOIN public.corrective_actions ca ON ca.id = a.capa_id
        JOIN public.indicators i ON i.id = ca.indicator_id
        WHERE a.storage_path = storage.objects.name
          AND (
            a.uploaded_by = auth.uid()
            OR ca.created_by = auth.uid()
            OR (
              private.has_role(auth.uid(), 'staff'::app_role)
              AND i.department_id = private.current_user_department()
            )
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.capa_documents d
        WHERE d.storage_path = storage.objects.name
          AND (
            d.uploaded_by = auth.uid()
            OR (
              private.has_role(auth.uid(), 'staff'::app_role)
              AND d.related_indicator_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM public.indicators i
                WHERE i.id = d.related_indicator_id
                  AND i.department_id = private.current_user_department()
              )
            )
          )
      )
    )
  );

-- user_roles: add explicit restrictive policy to guarantee no self-service writes
CREATE POLICY ur_no_self_write ON public.user_roles
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
