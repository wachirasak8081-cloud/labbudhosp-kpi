
-- 1) Move SECURITY DEFINER helper functions out of the API-exposed public schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.current_user_department()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_department() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_department() TO authenticated, service_role;

-- 2) Recreate all policies that referenced public.has_role / public.current_user_department
-- user_roles
DROP POLICY IF EXISTS ur_admin_all ON public.user_roles;
DROP POLICY IF EXISTS ur_admin_read ON public.user_roles;
CREATE POLICY ur_admin_all ON public.user_roles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY ur_admin_read ON public.user_roles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'));

-- departments — also FIX departments_anon_readable: restrict dept_read to authenticated only
DROP POLICY IF EXISTS dept_admin_all ON public.departments;
DROP POLICY IF EXISTS dept_read ON public.departments;
CREATE POLICY dept_admin_all ON public.departments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY dept_read ON public.departments FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.departments FROM anon;

-- profiles — also FIX measurements_staff_insert_privilege_escalation:
-- prevent a self-update from changing department_id (which would let staff jump departments
-- and bypass current_user_department-based checks on measurements).
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_read ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY profiles_admin_read ON public.profiles FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'auditor'));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND department_id IS NOT DISTINCT FROM (SELECT p.department_id FROM public.profiles p WHERE p.id = auth.uid())
    AND is_active IS NOT DISTINCT FROM (SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid())
  );

-- indicators
DROP POLICY IF EXISTS ind_admin_all ON public.indicators;
CREATE POLICY ind_admin_all ON public.indicators FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));

-- measurements
DROP POLICY IF EXISTS meas_admin_all ON public.measurements;
DROP POLICY IF EXISTS meas_manager_update ON public.measurements;
DROP POLICY IF EXISTS meas_staff_insert ON public.measurements;
DROP POLICY IF EXISTS meas_staff_update ON public.measurements;
CREATE POLICY meas_admin_all ON public.measurements FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY meas_manager_update ON public.measurements FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'manager')) WITH CHECK (private.has_role(auth.uid(),'manager'));
CREATE POLICY meas_staff_insert ON public.measurements FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(),'staff')
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = measurements.indicator_id AND i.department_id = private.current_user_department()
    )
  );
CREATE POLICY meas_staff_update ON public.measurements FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(),'staff')
    AND status <> 'approved'
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = measurements.indicator_id AND i.department_id = private.current_user_department()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(),'staff')
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = measurements.indicator_id AND i.department_id = private.current_user_department()
    )
  );

-- target_history
DROP POLICY IF EXISTS th_mgr_insert ON public.target_history;
CREATE POLICY th_mgr_insert ON public.target_history FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'admin'));

-- corrective_actions
DROP POLICY IF EXISTS capa_admin_all ON public.corrective_actions;
DROP POLICY IF EXISTS capa_mgr_update ON public.corrective_actions;
DROP POLICY IF EXISTS capa_mgr_write ON public.corrective_actions;
CREATE POLICY capa_admin_all ON public.corrective_actions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY capa_mgr_update ON public.corrective_actions FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'manager')) WITH CHECK (private.has_role(auth.uid(),'manager'));
CREATE POLICY capa_mgr_write ON public.corrective_actions FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'manager'));

-- audit_logs
DROP POLICY IF EXISTS audit_admin_read ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'auditor'));

-- 3) Drop the now-unused public-schema SECURITY DEFINER helper functions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.current_user_department();
