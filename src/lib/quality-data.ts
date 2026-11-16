import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "./fetch-all";
import { sortIndicators } from "./indicator-sort";
import { makeCalcContext, computeMonthly, avgOverMonths } from "./indicator-calc";
import { FISCAL_MONTH_TO_CAL } from "./fiscal-year";
import { registerIndicatorDecimals } from "./indicator-format";
import type { Database } from "@/integrations/supabase/types";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export const qualityOptions = (year: number) => queryOptions({
  queryKey: ["quality", year],
  queryFn: async () => {
    const [inds, measurements, capa, evidence] = await Promise.all([
      fetchAll<Row<"indicators">>((f,t) => supabase.from("indicators").select("*").eq("is_active",true).order("sort_order").order("id").range(f,t)),
      fetchAll<Row<"measurements">>((f,t) => supabase.from("measurements").select("*").in("fiscal_year",[year,year-1]).order("id").range(f,t)),
      fetchAll<Row<"corrective_actions">>((f,t) => supabase.from("corrective_actions").select("*").eq("fiscal_year",year).order("id").range(f,t)),
      fetchAll<Row<"measurement_evidence">>((f,t) => supabase.from("measurement_evidence").select("*").order("id").range(f,t)),
    ]);
    const sorted = sortIndicators(inds);
    registerIndicatorDecimals(sorted);
    const current = measurements.filter(m => m.fiscal_year === year);
    const ctx = makeCalcContext(sorted,current);
    const prev = makeCalcContext(sorted,measurements.filter(m => m.fiscal_year === year-1));
    const rows = sorted.map(ind => { const monthly = computeMonthly(ind,ctx); return { ind, monthly, priorMonthly: computeMonthly(ind,prev), average: avgOverMonths(monthly,FISCAL_MONTH_TO_CAL) }; });
    return { rows, measurements:current, capa, evidence };
  },
});