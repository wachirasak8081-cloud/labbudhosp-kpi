CREATE OR REPLACE FUNCTION public.open_streak_capa(p_indicator uuid,p_year integer,p_month integer,p_plan text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i public.indicators; v numeric; pm integer; fy integer; k integer; existing uuid; result uuid; details text := ''; d date;
BEGIN
 IF NOT (private.has_role(auth.uid(),'admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'staff')) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO i FROM public.indicators WHERE id=p_indicator;
 IF i.id IS NULL OR i.target_value IS NULL OR p_month NOT BETWEEN 1 AND 12 OR length(trim(p_plan))=0 THEN RAISE EXCEPTION 'Invalid CAPA input'; END IF;
 d:=make_date(p_year-543-CASE WHEN p_month>=10 THEN 1 ELSE 0 END,p_month,1);
 FOR k IN 0..2 LOOP
  pm:=extract(month FROM d-k*interval '1 month'); fy:=extract(year FROM d-k*interval '1 month')+543+CASE WHEN pm>=10 THEN 1 ELSE 0 END;
  SELECT calculated_value INTO v FROM public.measurements WHERE indicator_id=p_indicator AND fiscal_year=fy AND period_month=pm;
  IF v IS NULL OR NOT (CASE WHEN i.is_inverted OR i.target_condition='lte' THEN v>i.target_value WHEN i.target_condition='eq' THEN abs(v-i.target_value)>=0.001 ELSE v<i.target_value END) THEN RAISE EXCEPTION 'Three consecutive failing months required'; END IF;
  details:=details || to_char(d-k*interval '1 month','YYYY-MM') || ': ' || v::text || E'\n';
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtext(p_indicator::text||p_year::text||p_month::text));
 SELECT id INTO existing FROM public.corrective_actions WHERE indicator_id=p_indicator AND fiscal_year=p_year AND period_month=p_month AND status<>'closed' ORDER BY created_at LIMIT 1;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 INSERT INTO public.corrective_actions(indicator_id,fiscal_year,period_month,problem_description,action_plan,created_by,nc_source,approval_status,pdca_phase,status,verification_before,nc_detected_date)
 VALUES(p_indicator,p_year,p_month,i.code||' ไม่ผ่าน 3 เดือนต่อเนื่อง; เป้า '||i.target_value::text||E'\n'||details,trim(p_plan),auth.uid(),'kpi_below_target','draft','plan','open',v,current_date) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.open_streak_capa(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_streak_capa(uuid,integer,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.generate_submission_reminders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE today date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; prior date; fy integer; pm integer; phase text; n integer;
BEGIN
 prior:=date_trunc('month',today)-interval '1 month'; pm:=extract(month FROM prior); fy:=extract(year FROM prior)+543+CASE WHEN pm>=10 THEN 1 ELSE 0 END;
 phase:=CASE WHEN extract(day FROM today)=12 THEN 'due_soon' WHEN extract(day FROM today)=15 THEN 'due_today' WHEN extract(day FROM today)>15 THEN 'overdue' ELSE NULL END;
 IF phase IS NULL THEN RETURN 0; END IF;
 INSERT INTO public.notifications(user_id,type,title,body,link,indicator_id,fiscal_year,period_month)
 SELECT DISTINCT ur.user_id,'submission_'||phase,CASE phase WHEN 'due_soon' THEN 'ใกล้กำหนดส่งผลวันที่ 15' WHEN 'due_today' THEN 'ครบกำหนดส่งผลวันนี้' ELSE 'ผลรายเดือนเกินกำหนดส่ง' END,
 i.code||' '||i.name_th||' — เดือน '||pm::text||' ปีงบประมาณ '||fy::text,'/data-entry',i.id,fy,pm
 FROM public.indicators i CROSS JOIN public.user_roles ur JOIN public.profiles p ON p.id=ur.user_id AND p.is_active
 WHERE i.is_active AND i.is_leaf AND i.frequency='monthly' AND (ur.role IN ('admin','manager') OR (ur.role='staff' AND (i.assigned_user_id=ur.user_id OR i.department_id=p.department_id)))
 AND NOT EXISTS(SELECT 1 FROM public.measurements m WHERE m.indicator_id=i.id AND m.fiscal_year=fy AND m.period_month=pm AND m.status IN ('submitted','approved'))
 AND NOT EXISTS(SELECT 1 FROM public.notifications x WHERE x.user_id=ur.user_id AND x.indicator_id=i.id AND x.fiscal_year=fy AND x.period_month=pm AND x.type='submission_'||phase);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.generate_submission_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_submission_reminders() TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_cron;