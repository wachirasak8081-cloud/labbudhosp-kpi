INSERT INTO public.notifications (user_id, type, title, body, link, indicator_id, fiscal_year, period_month, created_at)
SELECT r.uid,
       'below_target',
       'ค่าตัวชี้วัดต่ำกว่าเป้าหมาย',
       b.code || ' ' || b.name_th || ' = ' || round(b.calculated_value::numeric, 4)::text
         || ' (เป้า ' || round(b.target_value::numeric, 4)::text || ')',
       '/dashboard/indicator/' || b.indicator_id::text,
       b.indicator_id, b.fiscal_year, b.period_month, b.entered_at
FROM (
  SELECT m.indicator_id, m.fiscal_year, m.period_month, m.calculated_value, m.entered_at,
         i.code, i.name_th, i.target_value, i.assigned_user_id
  FROM public.measurements m
  JOIN public.indicators i ON i.id = m.indicator_id
  WHERE i.is_leaf AND i.is_active
    AND i.target_value IS NOT NULL AND m.calculated_value IS NOT NULL
    AND (
      CASE
        WHEN COALESCE(i.is_inverted,false) OR i.target_condition = 'lte' THEN m.calculated_value > i.target_value
        WHEN i.target_condition = 'eq' THEN abs(m.calculated_value - i.target_value) > 0.001
        ELSE m.calculated_value < i.target_value
      END
    )
) b
CROSS JOIN LATERAL (
  SELECT DISTINCT u AS uid FROM (
    SELECT b.assigned_user_id AS u
    UNION
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','manager')
  ) s WHERE u IS NOT NULL
) r
WHERE NOT EXISTS (
  SELECT 1 FROM public.notifications n
  WHERE n.user_id = r.uid AND n.type = 'below_target'
    AND n.indicator_id = b.indicator_id AND n.fiscal_year = b.fiscal_year
    AND n.period_month IS NOT DISTINCT FROM b.period_month
);