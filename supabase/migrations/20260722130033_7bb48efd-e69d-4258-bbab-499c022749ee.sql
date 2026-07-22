
CREATE TABLE IF NOT EXISTS public.annual_objective_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.indicators(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  value numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (objective_id, fiscal_year)
);

GRANT SELECT ON public.annual_objective_summary TO authenticated;
GRANT ALL ON public.annual_objective_summary TO service_role;

ALTER TABLE public.annual_objective_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annual_summary_read_authenticated" ON public.annual_objective_summary
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "annual_summary_admin_manage" ON public.annual_objective_summary
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_annual_summary_updated_at
  BEFORE UPDATE ON public.annual_objective_summary
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.recompute_parent_measurement(_parent_id uuid, _fiscal_year integer, _period_month integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_is_leaf boolean;
  v_avg numeric;
  v_val numeric;
  v_count integer;
BEGIN
  SELECT code, is_leaf INTO v_code, v_is_leaf FROM public.indicators WHERE id = _parent_id;
  IF v_is_leaf THEN RETURN; END IF;

  WITH child_vals AS (
    SELECT
      ch.id AS child_id,
      ch.frequency,
      CASE
        WHEN ch.frequency = 'yearly' THEN (
          SELECT m2.calculated_value
          FROM public.measurements m2
          WHERE m2.indicator_id = ch.id
            AND m2.fiscal_year = _fiscal_year
            AND m2.calculated_value IS NOT NULL
          ORDER BY m2.period_month DESC NULLS LAST
          LIMIT 1
        )
        ELSE (
          SELECT m3.calculated_value
          FROM public.measurements m3
          WHERE m3.indicator_id = ch.id
            AND m3.fiscal_year = _fiscal_year
            AND m3.period_month = _period_month
          LIMIT 1
        )
      END AS val
    FROM public.indicators ch
    WHERE ch.parent_id = _parent_id
      AND ch.is_active = true
  )
  SELECT AVG(val), COUNT(val) INTO v_avg, v_count FROM child_vals;

  IF v_count = 0 THEN
    DELETE FROM public.measurements
      WHERE indicator_id = _parent_id
        AND fiscal_year = _fiscal_year
        AND period_month = _period_month;
    RETURN;
  END IF;

  IF v_code = 'KPI4' THEN
    v_val := 100 - COALESCE(v_avg, 0);
  ELSE
    v_val := v_avg;
  END IF;

  INSERT INTO public.measurements (indicator_id, fiscal_year, period_month, calculated_value, status, note)
    VALUES (_parent_id, _fiscal_year, _period_month, v_val, 'approved', 'auto-calculated')
  ON CONFLICT (indicator_id, fiscal_year, period_month)
  DO UPDATE SET calculated_value = EXCLUDED.calculated_value,
                status = 'approved',
                note = 'auto-calculated',
                updated_at = now();
END;
$function$;

INSERT INTO public.annual_objective_summary (objective_id, fiscal_year, value, note)
SELECT i.id, y.fy, y.val, y.note
FROM (VALUES
  ('OBJ1', 2566, 98.63, NULL::text),
  ('OBJ1', 2567, 97.85, NULL),
  ('OBJ1', 2568, 98.46, NULL),
  ('OBJ1', 2569, 96.90, 'ต.ค.68-มี.ค.69'),
  ('OBJ2', 2566, 84.81, NULL),
  ('OBJ2', 2567, 86.45, NULL),
  ('OBJ2', 2568, 86.58, NULL),
  ('OBJ2', 2569, 89.13, 'ต.ค.68-มี.ค.69'),
  ('OBJ3', 2566, 85.68, NULL),
  ('OBJ3', 2567, 93.27, NULL),
  ('OBJ3', 2568, 95.92, NULL),
  ('OBJ3', 2569, 96.91, 'ต.ค.68-มี.ค.69'),
  ('OBJ4', 2566, 92.15, NULL),
  ('OBJ4', 2567, 91.36, NULL),
  ('OBJ4', 2568, 91.89, NULL),
  ('OBJ4', 2569, 93.25, 'ต.ค.68-มี.ค.69')
) AS y(code, fy, val, note)
JOIN public.indicators i ON i.code = y.code
ON CONFLICT (objective_id, fiscal_year) DO UPDATE
  SET value = EXCLUDED.value, note = EXCLUDED.note, updated_at = now();
