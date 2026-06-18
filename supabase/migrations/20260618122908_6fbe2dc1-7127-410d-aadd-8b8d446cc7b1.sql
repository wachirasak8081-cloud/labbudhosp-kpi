
-- ========= ENUMS =========
CREATE TYPE public.app_role AS ENUM ('admin','manager','staff','auditor');

-- ========= DEPARTMENTS =========
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_th text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO anon, authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

INSERT INTO public.departments (code, name_th) VALUES
  ('chemistry','เคมีคลินิก'),
  ('hematology','โลหิตวิทยา'),
  ('bloodbank','ธนาคารเลือด'),
  ('microscopic','จุลทรรศนศาสตร์'),
  ('immunology','ภูมิคุ้มกันวิทยา'),
  ('bacteria','จุลชีววิทยา'),
  ('biomolecular','อณูชีววิทยา'),
  ('general','ทั่วไป');

-- ========= PROFILES =========
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ========= USER_ROLES =========
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role checker (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ========= INDICATORS =========
CREATE TABLE public.indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_th text NOT NULL,
  level text NOT NULL CHECK (level IN ('object','kpi','qi','subqi')),
  parent_id uuid REFERENCES public.indicators(id) ON DELETE CASCADE,
  formula_description text,
  formula_link text,
  numerator_description text,
  denominator_description text,
  target_value numeric,
  target_condition text CHECK (target_condition IN ('gte','lte','eq')),
  unit text DEFAULT '%',
  frequency text CHECK (frequency IN ('monthly','yearly')),
  is_leaf boolean NOT NULL DEFAULT false,
  is_inverted boolean NOT NULL DEFAULT false,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_indicators_parent ON public.indicators(parent_id);
CREATE INDEX idx_indicators_dept ON public.indicators(department_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicators TO authenticated;
GRANT ALL ON public.indicators TO service_role;
ALTER TABLE public.indicators ENABLE ROW LEVEL SECURITY;

-- ========= MEASUREMENTS =========
CREATE TABLE public.measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.indicators(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  period_month integer CHECK (period_month BETWEEN 1 AND 12),
  numerator numeric,
  denominator numeric,
  calculated_value numeric GENERATED ALWAYS AS (
    CASE WHEN denominator IS NULL OR denominator = 0 THEN NULL
         ELSE (numerator / denominator * 100) END
  ) STORED,
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(indicator_id, fiscal_year, period_month)
);
CREATE INDEX idx_measurements_indicator ON public.measurements(indicator_id);
CREATE INDEX idx_measurements_year ON public.measurements(fiscal_year);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurements TO authenticated;
GRANT ALL ON public.measurements TO service_role;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

-- ========= TARGET HISTORY =========
CREATE TABLE public.target_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.indicators(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  old_target numeric,
  new_target numeric NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
GRANT SELECT, INSERT ON public.target_history TO authenticated;
GRANT ALL ON public.target_history TO service_role;
ALTER TABLE public.target_history ENABLE ROW LEVEL SECURITY;

-- ========= CORRECTIVE ACTIONS =========
CREATE TABLE public.corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES public.indicators(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  period_month integer,
  problem_description text NOT NULL,
  root_cause text,
  action_plan text NOT NULL,
  responsible_person text,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  result_description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corrective_actions TO authenticated;
GRANT ALL ON public.corrective_actions TO service_role;
ALTER TABLE public.corrective_actions ENABLE ROW LEVEL SECURITY;

-- ========= AUDIT LOGS =========
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  old_data jsonb,
  new_data jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_table ON public.audit_logs(table_name, performed_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ========= UPDATED_AT TRIGGER =========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_indicators_updated BEFORE UPDATE ON public.indicators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_measurements_updated BEFORE UPDATE ON public.measurements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_capa_updated BEFORE UPDATE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========= NEW USER HANDLER =========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  -- Default new sign-ups to 'staff'; admin can promote later.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========= AUDIT TRIGGER =========
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(table_name, record_id, action, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(table_name, record_id, action, old_data, performed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER aud_indicators AFTER INSERT OR UPDATE OR DELETE ON public.indicators
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER aud_measurements AFTER INSERT OR UPDATE OR DELETE ON public.measurements
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER aud_capa AFTER INSERT OR UPDATE OR DELETE ON public.corrective_actions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER aud_targets AFTER INSERT ON public.target_history
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ========= RLS POLICIES =========

-- DEPARTMENTS: all authenticated read; admin manage
CREATE POLICY dept_read ON public.departments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dept_admin_all ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PROFILES
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_admin_read ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'auditor'));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- USER_ROLES: users can read their own; admin manages
CREATE POLICY ur_self_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ur_admin_read ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY ur_admin_all ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- INDICATORS: all authenticated read; admin manage
CREATE POLICY ind_read ON public.indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY ind_admin_all ON public.indicators FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- MEASUREMENTS
CREATE POLICY meas_read ON public.measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY meas_admin_all ON public.measurements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY meas_manager_update ON public.measurements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'manager'));
CREATE POLICY meas_staff_insert ON public.measurements FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'staff')
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = indicator_id AND i.department_id = public.current_user_department()
    )
  );
CREATE POLICY meas_staff_update ON public.measurements FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'staff')
    AND status <> 'approved'
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = indicator_id AND i.department_id = public.current_user_department()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(),'staff')
    AND EXISTS (
      SELECT 1 FROM public.indicators i
      WHERE i.id = indicator_id AND i.department_id = public.current_user_department()
    )
  );

-- TARGET HISTORY
CREATE POLICY th_read ON public.target_history FOR SELECT TO authenticated USING (true);
CREATE POLICY th_mgr_insert ON public.target_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

-- CORRECTIVE ACTIONS
CREATE POLICY capa_read ON public.corrective_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY capa_admin_all ON public.corrective_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY capa_mgr_write ON public.corrective_actions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'manager'));
CREATE POLICY capa_mgr_update ON public.corrective_actions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'manager'));

-- AUDIT LOGS: admin + auditor read only
CREATE POLICY audit_admin_read ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'auditor'));
