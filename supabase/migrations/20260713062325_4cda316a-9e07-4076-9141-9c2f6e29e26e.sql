
-- Extend corrective_actions with PDCA / RCA fields
ALTER TABLE public.corrective_actions
  ADD COLUMN IF NOT EXISTS severity text CHECK (severity IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('P1','P2','P3','P4')),
  ADD COLUMN IF NOT EXISTS nc_source text CHECK (nc_source IN ('kpi_below_target','iqa','eqa','complaint','audit','incident','manual')),
  ADD COLUMN IF NOT EXISTS nc_detected_date date,
  ADD COLUMN IF NOT EXISTS nc_detected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rca_method text CHECK (rca_method IN ('5why','fishbone','pareto','other')),
  ADD COLUMN IF NOT EXISTS rca_data jsonb,
  ADD COLUMN IF NOT EXISTS containment_action text,
  ADD COLUMN IF NOT EXISTS pdca_phase text CHECK (pdca_phase IN ('plan','do','check','act')) DEFAULT 'plan',
  ADD COLUMN IF NOT EXISTS approval_status text CHECK (approval_status IN ('draft','pending_manager','approved','rejected')) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS verification_before numeric,
  ADD COLUMN IF NOT EXISTS verification_1m numeric,
  ADD COLUMN IF NOT EXISTS verification_3m numeric,
  ADD COLUMN IF NOT EXISTS effectiveness text CHECK (effectiveness IN ('effective','partial','ineffective')),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- capa_attachments
CREATE TABLE IF NOT EXISTS public.capa_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_id uuid NOT NULL REFERENCES public.corrective_actions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capa_attachments TO authenticated;
GRANT ALL ON public.capa_attachments TO service_role;
ALTER TABLE public.capa_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_read" ON public.capa_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "att_insert" ON public.capa_attachments FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "att_delete_own" ON public.capa_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager'));
CREATE INDEX IF NOT EXISTS idx_att_capa ON public.capa_attachments(capa_id);

-- capa_documents (knowledge base / WI library)
CREATE TABLE IF NOT EXISTS public.capa_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  doc_code text,
  related_indicator_id uuid REFERENCES public.indicators(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  storage_path text,
  version text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capa_documents TO authenticated;
GRANT ALL ON public.capa_documents TO service_role;
ALTER TABLE public.capa_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_read" ON public.capa_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "doc_write_mgr" ON public.capa_documents FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager'))
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_capa_docs_updated
  BEFORE UPDATE ON public.capa_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- capa_comments
CREATE TABLE IF NOT EXISTS public.capa_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_id uuid NOT NULL REFERENCES public.corrective_actions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.capa_comments TO authenticated;
GRANT ALL ON public.capa_comments TO service_role;
ALTER TABLE public.capa_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmt_read" ON public.capa_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "cmt_insert" ON public.capa_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cmt_delete_own" ON public.capa_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_cmt_capa ON public.capa_comments(capa_id);

-- Auto-populate NC trigger: when a leaf measurement falls below target and no open CAPA exists → create draft NC row
CREATE OR REPLACE FUNCTION public.autopop_nc_from_measurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target numeric;
  v_cond text;
  v_inverted boolean;
  v_is_leaf boolean;
  v_below boolean;
  v_exists boolean;
BEGIN
  SELECT is_leaf, target_value, target_condition, is_inverted
    INTO v_is_leaf, v_target, v_cond, v_inverted
    FROM public.indicators WHERE id = NEW.indicator_id;

  IF NOT COALESCE(v_is_leaf,false) OR v_target IS NULL OR NEW.calculated_value IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_inverted,false) OR v_cond = 'lte' THEN
    v_below := NEW.calculated_value > v_target;
  ELSIF v_cond = 'eq' THEN
    v_below := abs(NEW.calculated_value - v_target) > 0.001;
  ELSE
    v_below := NEW.calculated_value < v_target;
  END IF;

  IF NOT v_below THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.corrective_actions
    WHERE indicator_id = NEW.indicator_id
      AND fiscal_year = NEW.fiscal_year
      AND period_month = NEW.period_month
      AND status <> 'closed'
  ) INTO v_exists;

  IF v_exists THEN RETURN NEW; END IF;

  INSERT INTO public.corrective_actions(
    indicator_id, fiscal_year, period_month,
    problem_description, action_plan,
    nc_source, nc_detected_date,
    approval_status, pdca_phase, status,
    verification_before,
    severity
  ) VALUES (
    NEW.indicator_id, NEW.fiscal_year, NEW.period_month,
    'ค่าตัวชี้วัดต่ำกว่าเป้าหมาย (auto-detected)',
    '(รอกำหนดแผนแก้ไข)',
    'kpi_below_target', CURRENT_DATE,
    'draft', 'plan', 'open',
    NEW.calculated_value,
    CASE
      WHEN abs(NEW.calculated_value - v_target) > 10 THEN 'critical'
      WHEN abs(NEW.calculated_value - v_target) > 5 THEN 'high'
      WHEN abs(NEW.calculated_value - v_target) > 2 THEN 'medium'
      ELSE 'low'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autopop_nc ON public.measurements;
CREATE TRIGGER trg_autopop_nc
  AFTER INSERT OR UPDATE OF calculated_value ON public.measurements
  FOR EACH ROW EXECUTE FUNCTION public.autopop_nc_from_measurement();
