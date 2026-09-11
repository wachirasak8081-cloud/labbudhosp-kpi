DROP POLICY IF EXISTS "authenticated can read user departments" ON public.user_departments;

CREATE POLICY "read own or privileged user departments"
ON public.user_departments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'manager')
  OR private.has_role(auth.uid(), 'auditor')
);

DROP POLICY IF EXISTS "capa_docs_upload" ON storage.objects;

CREATE POLICY "capa_docs_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'capa-docs'
  AND (
    (
      (storage.foldername(name))[1] = 'kb'
      AND (private.has_role(auth.uid(), 'admin') OR private.has_role(auth.uid(), 'manager'))
    )
    OR EXISTS (
      SELECT 1 FROM public.corrective_actions ca
      WHERE ca.id::text = (storage.foldername(name))[1]
        AND (
          ca.created_by = auth.uid()
          OR private.has_role(auth.uid(), 'admin')
          OR private.has_role(auth.uid(), 'manager')
          OR private.has_role(auth.uid(), 'staff')
        )
    )
  )
);