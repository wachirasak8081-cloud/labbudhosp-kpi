
DROP POLICY IF EXISTS ur_no_self_write ON public.user_roles;
CREATE POLICY ur_no_self_insert ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ur_no_self_update ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ur_no_self_delete ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
