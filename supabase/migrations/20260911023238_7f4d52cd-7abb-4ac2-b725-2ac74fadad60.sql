CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  indicator_id uuid REFERENCES public.indicators(id) ON DELETE CASCADE,
  fiscal_year integer,
  period_month integer,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own notifications" ON public.notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

CREATE POLICY "update own notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete own notifications" ON public.notifications
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_measurement_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ind record;
  v_below boolean;
  v_link text;
  v_uid uuid;
BEGIN
  SELECT id, code, name_th, is_leaf, target_value, target_condition, is_inverted, assigned_user_id
    INTO v_ind FROM public.indicators WHERE id = NEW.indicator_id;
  IF v_ind.id IS NULL OR NOT COALESCE(v_ind.is_leaf, false) THEN RETURN NEW; END IF;

  v_link := '/dashboard/indicator/' || v_ind.id::text;

  -- 1) submitted for approval -> notify admins & managers
  IF NEW.status = 'submitted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submitted') THEN
    FOR v_uid IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager')
    LOOP
      INSERT INTO public.notifications(user_id, type, title, body, link, indicator_id, fiscal_year, period_month)
      VALUES (v_uid, 'submitted',
        'มีข้อมูลรออนุมัติ',
        v_ind.code || ' ' || v_ind.name_th,
        v_link, v_ind.id, NEW.fiscal_year, NEW.period_month);
    END LOOP;
  END IF;

  -- 2) value below target -> notify owner + admins/managers
  IF NEW.calculated_value IS NOT NULL AND v_ind.target_value IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.calculated_value IS DISTINCT FROM NEW.calculated_value) THEN
    IF COALESCE(v_ind.is_inverted, false) OR v_ind.target_condition = 'lte' THEN
      v_below := NEW.calculated_value > v_ind.target_value;
    ELSIF v_ind.target_condition = 'eq' THEN
      v_below := abs(NEW.calculated_value - v_ind.target_value) > 0.001;
    ELSE
      v_below := NEW.calculated_value < v_ind.target_value;
    END IF;

    IF v_below THEN
      FOR v_uid IN
        SELECT DISTINCT u FROM (
          SELECT v_ind.assigned_user_id AS u
          UNION
          SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager')
        ) s WHERE u IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = v_uid AND n.type = 'below_target'
            AND n.indicator_id = v_ind.id AND n.fiscal_year = NEW.fiscal_year
            AND n.period_month IS NOT DISTINCT FROM NEW.period_month
        ) THEN
          INSERT INTO public.notifications(user_id, type, title, body, link, indicator_id, fiscal_year, period_month)
          VALUES (v_uid, 'below_target',
            'ค่าตัวชี้วัดต่ำกว่าเป้าหมาย',
            v_ind.code || ' ' || v_ind.name_th || ' = ' || round(NEW.calculated_value::numeric, 4)::text
              || ' (เป้า ' || round(v_ind.target_value::numeric, 4)::text || ')',
            v_link, v_ind.id, NEW.fiscal_year, NEW.period_month);
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_measurements
AFTER INSERT OR UPDATE ON public.measurements
FOR EACH ROW EXECUTE FUNCTION public.notify_measurement_events();