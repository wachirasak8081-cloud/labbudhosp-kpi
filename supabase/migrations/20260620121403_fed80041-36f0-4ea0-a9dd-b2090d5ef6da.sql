
-- 1. Replace generated calculated_value with regular nullable column
ALTER TABLE public.measurements DROP COLUMN calculated_value;
ALTER TABLE public.measurements ADD COLUMN calculated_value numeric;

-- 2. BEFORE trigger: compute leaf value from numerator/denominator
CREATE OR REPLACE FUNCTION public.measurements_compute_leaf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_leaf boolean;
BEGIN
  SELECT is_leaf INTO v_is_leaf FROM public.indicators WHERE id = NEW.indicator_id;
  IF v_is_leaf THEN
    IF NEW.numerator IS NOT NULL AND NEW.denominator IS NOT NULL AND NEW.denominator <> 0 THEN
      NEW.calculated_value := (NEW.numerator / NEW.denominator) * 100;
    ELSE
      NEW.calculated_value := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS measurements_compute_leaf_trg ON public.measurements;
CREATE TRIGGER measurements_compute_leaf_trg
BEFORE INSERT OR UPDATE ON public.measurements
FOR EACH ROW EXECUTE FUNCTION public.measurements_compute_leaf();

-- 3. Recompute one parent indicator value for one (fiscal_year, period_month)
CREATE OR REPLACE FUNCTION public.recompute_parent_measurement(
  _parent_id uuid, _fiscal_year integer, _period_month integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_is_leaf boolean;
  v_avg numeric;
  v_val numeric;
  v_count integer;
BEGIN
  SELECT code, is_leaf INTO v_code, v_is_leaf FROM public.indicators WHERE id = _parent_id;
  IF v_is_leaf THEN RETURN; END IF;

  -- Average of direct children's calculated_value for the same period
  SELECT AVG(m.calculated_value), COUNT(m.calculated_value)
    INTO v_avg, v_count
  FROM public.indicators ch
  LEFT JOIN public.measurements m
    ON m.indicator_id = ch.id
   AND m.fiscal_year = _fiscal_year
   AND m.period_month = _period_month
  WHERE ch.parent_id = _parent_id
    AND ch.is_active = true;

  IF v_count = 0 THEN
    -- no child data; remove any existing computed parent row
    DELETE FROM public.measurements
      WHERE indicator_id = _parent_id
        AND fiscal_year = _fiscal_year
        AND period_month = _period_month;
    RETURN;
  END IF;

  -- Special case: KPI4 = 100 - AVG(QI4.1, QI4.2)
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
$$;

-- 4. Cascade upward through all ancestors
CREATE OR REPLACE FUNCTION public.cascade_recompute_ancestors(
  _child_indicator_id uuid, _fiscal_year integer, _period_month integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
  v_current uuid := _child_indicator_id;
  v_guard int := 0;
BEGIN
  LOOP
    SELECT parent_id INTO v_parent FROM public.indicators WHERE id = v_current;
    EXIT WHEN v_parent IS NULL;
    PERFORM public.recompute_parent_measurement(v_parent, _fiscal_year, _period_month);
    v_current := v_parent;
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 10;
  END LOOP;
END;
$$;

-- 5. AFTER trigger: cascade ancestors after leaf changes
CREATE OR REPLACE FUNCTION public.measurements_cascade_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_leaf boolean;
  v_ind uuid;
  v_fy integer;
  v_pm integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ind := OLD.indicator_id; v_fy := OLD.fiscal_year; v_pm := OLD.period_month;
  ELSE
    v_ind := NEW.indicator_id; v_fy := NEW.fiscal_year; v_pm := NEW.period_month;
  END IF;

  SELECT is_leaf INTO v_is_leaf FROM public.indicators WHERE id = v_ind;
  -- only cascade when leaf changes (parent rows are written by cascade itself)
  IF v_is_leaf THEN
    PERFORM public.cascade_recompute_ancestors(v_ind, v_fy, v_pm);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS measurements_cascade_after_trg ON public.measurements;
CREATE TRIGGER measurements_cascade_after_trg
AFTER INSERT OR UPDATE OR DELETE ON public.measurements
FOR EACH ROW EXECUTE FUNCTION public.measurements_cascade_after();

-- 6. Backfill: recompute calculated_value for existing leaf rows
UPDATE public.measurements m
SET calculated_value = CASE
  WHEN m.numerator IS NOT NULL AND m.denominator IS NOT NULL AND m.denominator <> 0
    THEN (m.numerator / m.denominator) * 100
  ELSE NULL END
FROM public.indicators i
WHERE i.id = m.indicator_id AND i.is_leaf = true;

-- 7. Backfill parent values from existing leaf measurements
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT m.indicator_id, m.fiscal_year, m.period_month
    FROM public.measurements m
    JOIN public.indicators i ON i.id = m.indicator_id
    WHERE i.is_leaf = true
  LOOP
    PERFORM public.cascade_recompute_ancestors(r.indicator_id, r.fiscal_year, r.period_month);
  END LOOP;
END $$;
