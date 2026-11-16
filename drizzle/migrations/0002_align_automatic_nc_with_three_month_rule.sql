CREATE OR REPLACE FUNCTION public.autopop_nc_from_measurement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.indicators; d date; pm integer; fy integer; v numeric; k integer; details text:='';
BEGIN
 SELECT * INTO i FROM public.indicators WHERE id=NEW.indicator_id;
 IF NOT COALESCE(i.is_leaf,false) OR i.target_value IS NULL OR NEW.period_month IS NULL OR NEW.calculated_value IS NULL THEN RETURN NEW; END IF;
 d:=make_date(NEW.fiscal_year-543-CASE WHEN NEW.period_month>=10 THEN 1 ELSE 0 END,NEW.period_month,1);
 FOR k IN 0..2 LOOP
  pm:=extract(month FROM d-k*interval '1 month'); fy:=extract(year FROM d-k*interval '1 month')+543+CASE WHEN pm>=10 THEN 1 ELSE 0 END;
  SELECT calculated_value INTO v FROM public.measurements WHERE indicator_id=NEW.indicator_id AND fiscal_year=fy AND period_month=pm;
  IF v IS NULL OR NOT (CASE WHEN i.is_inverted OR i.target_condition='lte' THEN v>i.target_value WHEN i.target_condition='eq' THEN abs(v-i.target_value)>=0.001 ELSE v<i.target_value END) THEN RETURN NEW; END IF;
  details:=details||to_char(d-k*interval '1 month','YYYY-MM')||': '||v::text||E'\n';
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.indicator_id::text||NEW.fiscal_year::text||NEW.period_month::text));
 IF EXISTS(SELECT 1 FROM public.corrective_actions WHERE indicator_id=NEW.indicator_id AND fiscal_year=NEW.fiscal_year AND period_month=NEW.period_month AND status<>'closed') THEN RETURN NEW; END IF;
 INSERT INTO public.corrective_actions(indicator_id,fiscal_year,period_month,problem_description,action_plan,nc_source,nc_detected_date,approval_status,pdca_phase,status,verification_before,created_by)
 VALUES(NEW.indicator_id,NEW.fiscal_year,NEW.period_month,i.code||' ไม่ผ่าน 3 เดือนต่อเนื่อง; เป้า '||i.target_value::text||E'\n'||details,'(รอกำหนดแผนแก้ไข)','kpi_below_target',current_date,'draft','plan','open',NEW.calculated_value,NEW.entered_by);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.autopop_nc_from_measurement() FROM PUBLIC,anon,authenticated;