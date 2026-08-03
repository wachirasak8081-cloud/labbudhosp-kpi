import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, TrendingUp, TrendingDown, Circle, AlertTriangle, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { sortIndicators } from "@/lib/indicator-sort";
import { decimalsFor, formatIndicatorValue } from "@/lib/indicator-format";
import { toneFor, targetSymbol } from "@/lib/indicator-status";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { computeAtMonth, computeMonthly, makeCalcContext, type IndBasic, type MeasBasic } from "@/lib/indicator-calc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Ind = IndBasic & {
  name_th: string;
  target_value: number | null;
  target_condition: string | null;
  is_inverted: boolean | null;
  sort_order: number | null;
};
type Annual = { objective_id: string; fiscal_year: number; value: number };
type Capa = { indicator_id: string; status: string };

const HISTORICAL = [2566, 2567, 2568] as const;
const YEAR_COLORS = ["#1E3A5F", "#F97316", "#15803D", "#2563EB"];

// Quarter grouping: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep (fiscal)
const QUARTERS: { label: string; months: number[] }[] = [
  { label: "ไตรมาส 1 (ต.ค.-ธ.ค.)", months: [10, 11, 12] },
  { label: "ไตรมาส 2 (ม.ค.-มี.ค.)", months: [1, 2, 3] },
  { label: "ไตรมาส 3 (เม.ย.-มิ.ย.)", months: [4, 5, 6] },
  { label: "ไตรมาส 4 (ก.ค.-ก.ย.)", months: [7, 8, 9] },
];

function DashboardPage() {
  const { fiscalYear } = useFiscalYear();
  const [filterMode, setFilterMode] = useState<"all" | "quarter" | "month">("all");
  const [filterValue, setFilterValue] = useState<string>("all");
  const navigate = useNavigate();
  const [detailKpi, setDetailKpi] = useState<Ind | null>(null);


  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }, { data: capa }, { data: annual }] = await Promise.all([
        supabase.from("indicators")
          .select("id, code, name_th, level, parent_id, target_value, target_condition, is_inverted, is_leaf, is_active, frequency, sort_order")
          .eq("is_active", true).order("sort_order").order("code"),
        supabase.from("measurements")
          .select("indicator_id, period_month, calculated_value")
          .eq("fiscal_year", fiscalYear),
        supabase.from("corrective_actions").select("indicator_id, status").eq("fiscal_year", fiscalYear),
        supabase.from("annual_objective_summary").select("objective_id, fiscal_year, value"),
      ]);
      return {
        inds: sortIndicators((inds ?? []) as Ind[]),
        meas: (meas ?? []) as MeasBasic[],
        capa: (capa ?? []) as Capa[],
        annual: (annual ?? []) as Annual[],
      };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const ctx = makeCalcContext(data.inds, data.meas);

    // Determine active months per filter
    const activeMonths: number[] =
      filterMode === "month" && filterValue !== "all"
        ? [parseInt(filterValue, 10)]
        : filterMode === "quarter" && filterValue !== "all"
          ? (QUARTERS[parseInt(filterValue, 10)]?.months ?? FISCAL_MONTH_TO_CAL)
          : [...FISCAL_MONTH_TO_CAL];

    // Latest recorded fiscal month (based on any measurement present)
    const recordedCalSet = new Set<number>();
    data.meas.forEach((m) => { if (m.period_month != null && m.calculated_value != null) recordedCalSet.add(m.period_month); });
    let latestCal: number | null = null;
    let latestFiscalIdx = -1;
    for (const cm of recordedCalSet) {
      const i = FISCAL_MONTH_TO_CAL.indexOf(cm);
      if (i > latestFiscalIdx) { latestFiscalIdx = i; latestCal = cm; }
    }
    // "current period" for cards = last active month within filter that has data, else latest overall
    const filteredActive = activeMonths.filter((cm) => FISCAL_MONTH_TO_CAL.indexOf(cm) <= latestFiscalIdx);
    const curCal = filteredActive.length > 0 ? filteredActive[filteredActive.length - 1] : latestCal;
    const prevCal = curCal != null
      ? (() => { const i = FISCAL_MONTH_TO_CAL.indexOf(curCal); return i > 0 ? FISCAL_MONTH_TO_CAL[i - 1] : null; })()
      : null;

    // Aggregate helper: average over activeMonths of computed monthly values
    const aggregate = (ind: Ind): number | null => {
      const monthly = computeMonthly(ind, ctx);
      const vals: number[] = [];
      for (let i = 0; i < FISCAL_MONTH_TO_CAL.length; i++) {
        if (!activeMonths.includes(FISCAL_MONTH_TO_CAL[i])) continue;
        const v = monthly[i];
        if (v != null) vals.push(v);
      }
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const objectives = data.inds.filter((i) => i.level === "object");
    const kpis = data.inds.filter((i) => i.level === "kpi");

    // Objective cards
    const objectiveCards = objectives.map((o) => {
      const cur = curCal != null ? computeAtMonth(o, curCal, ctx) : null;
      const prev = prevCal != null ? computeAtMonth(o, prevCal, ctx) : null;
      const avg = aggregate(o);
      const display = filterMode === "all" ? avg : cur;
      const tone = toneFor(display, o.target_value, o.target_condition, o.is_inverted);
      const trend = cur != null && prev != null
        ? (cur > prev + 0.01 ? "up" : cur < prev - 0.01 ? "down" : "flat")
        : null;
      return { ind: o, display, cur, prev, tone, trend, avg };
    });

    // KPI cards — average of active months
    const kpiCards = kpis.map((k) => {
      const monthly = computeMonthly(k, ctx);
      const inFilter: { cal: number; v: number | null }[] = FISCAL_MONTH_TO_CAL
        .map((cm, i) => ({ cal: cm, v: activeMonths.includes(cm) ? monthly[i] : null }));
      const validForAvg = inFilter.map((x) => x.v).filter((x): x is number => x != null);
      const avg = validForAvg.length ? validForAvg.reduce((a, b) => a + b, 0) / validForAvg.length : null;
      const tone = toneFor(avg, k.target_value, k.target_condition, k.is_inverted);
      const monthsPassed = inFilter.filter((x) =>
        x.v != null && toneFor(x.v, k.target_value, k.target_condition, k.is_inverted) === "green"
      ).length;
      const monthsWithData = validForAvg.length;
      const diff = avg != null && k.target_value != null
        ? (k.is_inverted ? k.target_value - avg : avg - k.target_value) : null;
      const diffPct = diff != null && k.target_value ? (diff / k.target_value) * 100 : null;
      // last filled month for slider handle label
      const lastFilled = [...inFilter].reverse().find((x) => x.v != null);
      const lastFilledLabel = lastFilled ? THAI_MONTHS[FISCAL_MONTH_TO_CAL.indexOf(lastFilled.cal)] : "-";
      return { ind: k, monthly, avg, tone, monthsPassed, monthsWithData, diff, diffPct, lastFilledLabel };
    });

    // Non-conforming table — leaf indicators failing target
    const capaByInd = new Map<string, Capa[]>();
    for (const c of data.capa) {
      const arr = capaByInd.get(c.indicator_id) ?? [];
      arr.push(c);
      capaByInd.set(c.indicator_id, arr);
    }
    const nc: {
      ind: Ind; value: number; target: number; diff: number; capa: "none" | "progress" | "done";
    }[] = [];
    for (const ind of data.inds) {
      if (!ind.is_leaf || ind.target_value == null) continue;
      const monthly = computeMonthly(ind, ctx);
      const inFilter = monthly.filter((_, i) => activeMonths.includes(FISCAL_MONTH_TO_CAL[i])).filter((x): x is number => x != null);
      if (inFilter.length === 0) continue;
      const avg = inFilter.reduce((a, b) => a + b, 0) / inFilter.length;
      const tone = toneFor(avg, ind.target_value, ind.target_condition, ind.is_inverted);
      if (tone === "green") continue;
      const capaArr = capaByInd.get(ind.id) ?? [];
      let cs: "none" | "progress" | "done" = "none";
      if (capaArr.length) {
        if (capaArr.some((c) => c.status === "closed")) cs = "done";
        else cs = "progress";
      }
      nc.push({
        ind, value: avg, target: ind.target_value,
        diff: ind.is_inverted ? ind.target_value - avg : avg - ind.target_value,
        capa: cs,
      });
    }
    nc.sort((a, b) => a.diff - b.diff);

    // Recording stats — for latest month
    const curMonth = latestCal ?? (new Date().getMonth() + 1);
    const leafIds = data.inds.filter((i) => i.is_leaf).map((i) => i.id);
    const statusByLeaf = new Map<string, string>();
    // fetch statuses via a lightweight second call would be needed, but we already have meas without status.
    // recording stats needs status; refetch via query below (fallback: infer from calculated_value presence)
    for (const m of data.meas) {
      if (m.period_month !== curMonth) continue;
      if (m.calculated_value != null) statusByLeaf.set(m.indicator_id, "recorded");
    }
    let recorded = 0, awaiting = 0, pending = 0;
    for (const id of leafIds) {
      const s = statusByLeaf.get(id);
      if (s === "recorded") recorded++;
      else pending++;
    }

    // Historical annual data
    const annualByObj = new Map<string, Map<number, number>>();
    for (const a of data.annual) {
      if (!annualByObj.has(a.objective_id)) annualByObj.set(a.objective_id, new Map());
      annualByObj.get(a.objective_id)!.set(a.fiscal_year, Number(a.value));
    }

    // KPI averages grouped by parent objective — used for current-year bar value
    const kpiAvgByObj = new Map<string, number[]>();
    for (const k of kpiCards) {
      if (k.avg == null || !k.ind.parent_id) continue;
      const arr = kpiAvgByObj.get(k.ind.parent_id) ?? [];
      arr.push(k.avg);
      kpiAvgByObj.set(k.ind.parent_id, arr);
    }

    // Bar chart data — group per objective, bars per year.
    // Current-year value = average of KPI averages under this objective
    // (KPI4 keeps its 100 - avg rule).
    const chartData = objectiveCards.map(({ ind }) => {
      const hist = annualByObj.get(ind.id) ?? new Map();
      const kAvgs = kpiAvgByObj.get(ind.id) ?? [];
      const kMean = kAvgs.length ? kAvgs.reduce((a, b) => a + b, 0) / kAvgs.length : null;
      const curFromKpis = kMean == null ? null : (ind.code === "KPI4" ? 100 - kMean : kMean);
      const cur = curFromKpis ?? annualByObj.get(ind.id)?.get(fiscalYear) ?? null;
      // monthly breakdown of current year for tooltip
      const monthly = FISCAL_MONTH_TO_CAL.map((cm) => computeAtMonth(ind, cm, ctx));
      return {
        objective: ind,
        yearValues: [
          hist.get(HISTORICAL[0]) ?? null,
          hist.get(HISTORICAL[1]) ?? null,
          hist.get(HISTORICAL[2]) ?? null,
          cur,
        ] as (number | null)[],
        monthly,
      };
    });

    return {
      objectiveCards, kpiCards, nc,
      recorded, awaiting, pending, totalLeaf: leafIds.length,
      chartData, activeMonths, curMonth, ctx, inds: data.inds,
    };

  }, [data, filterMode, filterValue, fiscalYear]);

  if (isLoading || !view || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const yearLabels = [`ปี ${HISTORICAL[0]}`, `ปี ${HISTORICAL[1]}`, `ปี ${HISTORICAL[2]}`, `ปี ${fiscalYear}`];

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">ตัวกรอง:</span>
        <Select
          value={filterMode}
          onValueChange={(v) => { setFilterMode(v as "all" | "quarter" | "month"); setFilterValue("all"); }}
        >
          <SelectTrigger className="w-[140px] h-9 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งปี</SelectItem>
            <SelectItem value="quarter">รายไตรมาส</SelectItem>
            <SelectItem value="month">รายเดือน</SelectItem>
          </SelectContent>
        </Select>
        {filterMode === "quarter" && (
          <Select value={filterValue} onValueChange={setFilterValue}>
            <SelectTrigger className="w-[200px] h-9 bg-card"><SelectValue placeholder="เลือกไตรมาส" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกไตรมาส</SelectItem>
              {QUARTERS.map((q, i) => <SelectItem key={i} value={String(i)}>{q.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterMode === "month" && (
          <Select value={filterValue} onValueChange={setFilterValue}>
            <SelectTrigger className="w-[140px] h-9 bg-card"><SelectValue placeholder="เลือกเดือน" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกเดือน</SelectItem>
              {FISCAL_MONTH_TO_CAL.map((cm, i) => <SelectItem key={cm} value={String(cm)}>{THAI_MONTHS[i]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground ml-auto">ปีงบประมาณ {fiscalYear}</span>
      </div>

      {/* Objective cards */}
      <div>
        <h2 className="text-base font-bold mb-3">Objective : 1-4</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {view.objectiveCards.map(({ ind, display, prev, trend }) => {
            const diff = display != null && prev != null ? display - prev : null;
            return (
              <div key={ind.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-end">
                  <button
                    type="button"
                    onClick={() => setDetailKpi(ind)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[color:var(--accent-bg,oklch(0.96_0.02_250))] px-2.5 py-1 text-[11px] font-semibold text-primary hover:opacity-80"
                  >
                    รายละเอียด <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[13px] font-semibold text-foreground leading-snug mt-1" title={ind.name_th}>{ind.name_th}</div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-[26px] font-extrabold tabular-nums">
                    {display != null ? formatIndicatorValue(ind.code, display) + "%" : "—%"}
                  </span>
                  {trend === "up" && <TrendingUp className="w-4 h-4 text-[color:var(--success)]" />}
                  {trend === "down" && <TrendingDown className="w-4 h-4 text-[color:var(--destructive)]" />}
                  {trend === "flat" && <Circle className="w-3 h-3 text-muted-foreground" />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  เป้าหมาย: {ind.target_value != null ? ind.target_value.toFixed(decimalsFor(ind.code)) : "—"}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {prev != null
                    ? <>เดือนก่อนหน้า: {formatIndicatorValue(ind.code, prev)}%
                        {diff != null && (
                          <span className={cn("ml-1 font-semibold", diff >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]")}>
                            ({diff >= 0 ? "+" : ""}{diff.toFixed(decimalsFor(ind.code))})
                          </span>
                        )}
                      </>
                    : "เดือนก่อนหน้า: —"}
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {/* Yearly bar chart */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-base font-bold">เปรียบเทียบผลรายปี</h2>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {yearLabels.map((y, i) => (
              <span key={y} className="inline-flex items-center gap-1.5">
                <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: YEAR_COLORS[i] }} />{y}
              </span>
            ))}
          </div>
        </div>
        <YearlyBarChart data={view.chartData} yearLabels={yearLabels} />
      </div>

      {/* KPI cards */}
      <div>
        <h2 className="text-base font-bold mb-3">KPI : 1-11</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {view.kpiCards.map((k) => (
            <KpiCard
              key={k.ind.id}
              data={k}
              onDetail={() => setDetailKpi(k.ind)}
            />

          ))}
        </div>
      </div>

      {/* Non-conforming */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[color:var(--warning)] font-bold text-[15px] mb-3">
          <AlertTriangle className="w-4 h-4" />ตัวชี้วัดที่ไม่ผ่านเกณฑ์
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-muted-foreground text-left border-b border-border">
                <th className="py-2 px-2 font-semibold">ตัวชี้วัด</th>
                <th className="py-2 px-2 font-semibold text-right">ค่าล่าสุด</th>
                <th className="py-2 px-2 font-semibold text-right">เป้าหมาย</th>
                <th className="py-2 px-2 font-semibold text-right">ส่วนต่าง</th>
                <th className="py-2 px-2 font-semibold">CAPA</th>
              </tr>
            </thead>
            <tbody>
              {view.nc.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-8">ทุกตัวชี้วัดผ่านเกณฑ์</td></tr>
              )}
              {view.nc.map((r) => (
                <tr
                  key={r.ind.id}
                  className="border-b border-[color:oklch(0.96_0.008_240)] hover:bg-[oklch(0.98_0.005_240)] cursor-pointer"
                  onClick={() => navigate({ to: "/dashboard/indicator/$id", params: { id: r.ind.id } })}
                >
                  <td className="py-2.5 px-2 font-semibold">
                    {r.ind.name_th}
                    <span className="block font-normal text-muted-foreground text-[11px]">{r.ind.code}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{formatIndicatorValue(r.ind.code, r.value)}%</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{r.target.toFixed(decimalsFor(r.ind.code))}%</td>
                  <td className="py-2.5 px-2 text-right font-bold text-[color:var(--destructive)] tabular-nums">
                    {(r.ind.is_inverted ? "+" : "-")}{Math.abs(r.diff).toFixed(decimalsFor(r.ind.code))}
                  </td>
                  <td className="py-2.5 px-2">
                    <CapaBadge status={r.capa} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recording stats */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-bold mb-4">สถิติการบันทึก (เดือนล่าสุด)</h2>
        <StatRow icon={<CheckCircle2 className="w-4 h-4 text-[color:var(--success)]" />} label="บันทึก/อนุมัติแล้ว" value={view.recorded} total={view.totalLeaf} color="green" />
        <StatRow icon={<Clock className="w-4 h-4 text-[color:var(--warning)]" />} label="รออนุมัติ" value={view.awaiting} total={view.totalLeaf} color="amber" />
        <StatRow icon={<AlertTriangle className="w-4 h-4 text-[color:var(--destructive)]" />} label="ยังไม่บันทึก" value={view.pending} total={view.totalLeaf} color="red" />
      </div>

      {detailKpi && (
        <KpiDetailDialog
          kpi={detailKpi}
          inds={view.inds}
          ctx={view.ctx}
          activeMonths={view.activeMonths}
          onClose={() => setDetailKpi(null)}
          onOpenFull={(id) => { setDetailKpi(null); navigate({ to: "/dashboard/indicator/$id", params: { id } }); }}
        />
      )}
    </div>
  );
}

/* ---------------- KPI detail dialog (monthly matrix like /reports) ---------------- */
function toneBg(t: ReturnType<typeof toneFor>): string {
  return t === "green" ? "bg-emerald-50" : t === "yellow" ? "bg-amber-50" : t === "red" ? "bg-rose-50" : "";
}

function KpiDetailDialog({
  kpi, inds, ctx, activeMonths, onClose, onOpenFull,
}: {
  kpi: Ind;
  inds: Ind[];
  ctx: ReturnType<typeof makeCalcContext>;
  activeMonths: number[];
  onClose: () => void;
  onOpenFull: (id: string) => void;
}) {
  const rows = useMemo(() => {
    const byParent = new Map<string | null, Ind[]>();
    for (const i of inds) {
      const arr = byParent.get(i.parent_id) ?? [];
      arr.push(i);
      byParent.set(i.parent_id, arr);
    }
    const out: { ind: Ind; depth: number }[] = [];
    const walk = (parent: Ind, depth: number) => {
      for (const c of sortIndicators(byParent.get(parent.id) ?? [])) {
        out.push({ ind: c, depth });
        walk(c, depth + 1);
      }
    };
    out.push({ ind: kpi, depth: 0 });
    walk(kpi, 1);
    return out.map(({ ind, depth }) => {
      const monthly = computeMonthly(ind, ctx);
      const vals = monthly.filter((v, i) => v != null && activeMonths.includes(FISCAL_MONTH_TO_CAL[i])) as number[];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { ind, depth, monthly, avg };
    });
  }, [kpi, inds, ctx, activeMonths]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(96vw,1100px)]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {kpi.code} — {kpi.name_th}
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-1">
          รายละเอียดรายเดือนและค่าเฉลี่ยของ QI / Sub-QI ที่เกี่ยวข้อง
        </div>
        <div className="overflow-auto max-h-[65vh] mt-2">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="border p-1.5 text-left min-w-[240px] font-semibold">ตัวชี้วัด</th>
                <th className="border p-1.5 text-center font-semibold whitespace-nowrap">เป้า</th>
                {THAI_MONTHS.map((m) => <th key={m} className="border p-1.5 text-center font-semibold">{m}</th>)}
                <th className="border p-1.5 text-center font-semibold">เฉลี่ย</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ind, depth, monthly, avg }) => {
                const tone = toneFor(avg, ind.target_value, ind.target_condition, ind.is_inverted);
                return (
                  <tr key={ind.id} className={depth === 0 ? "font-bold bg-muted/40" : ""}>
                    <td className="border p-1.5" style={{ paddingLeft: 6 + depth * 14 }}>
                      <button type="button" className="text-left hover:underline" onClick={() => onOpenFull(ind.id)}>
                        <span className="font-mono text-[10px] text-muted-foreground mr-1">{ind.code}</span>
                        {ind.name_th}
                      </button>
                    </td>
                    <td className="border p-1.5 text-center whitespace-nowrap">
                      {ind.target_value != null ? `${targetSymbol(ind.target_condition)} ${ind.target_value.toFixed(decimalsFor(ind.code))}` : "—"}
                    </td>
                    {monthly.map((v, i) => (
                      <td key={i} className={cn("border p-1.5 text-center tabular-nums", toneBg(toneFor(v, ind.target_value, ind.target_condition, ind.is_inverted)))}>
                        {v == null ? "—" : v.toFixed(decimalsFor(ind.code))}
                      </td>
                    ))}
                    <td className={cn("border p-1.5 text-center font-bold tabular-nums", toneBg(tone))}>
                      {avg == null ? "—" : avg.toFixed(decimalsFor(ind.code))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- KPI Card ---------------- */
function KpiCard({
  data, onDetail,
}: {
  data: {
    ind: Ind;
    monthly: (number | null)[];
    avg: number | null;
    tone: ReturnType<typeof toneFor>;
    monthsPassed: number;
    monthsWithData: number;
    diff: number | null;
    diffPct: number | null;
    lastFilledLabel: string;
  };
  onDetail: () => void;
}) {
  const { ind, monthly, avg, tone, monthsPassed, monthsWithData, diff, diffPct, lastFilledLabel } = data;
  const pass = tone === "green";
  const targetPct = ind.target_value != null ? Math.min(100, ind.target_value) : 0;
  const avgPct = avg != null ? Math.min(100, Math.max(0, avg)) : 0;
  const targetSym = ind.target_condition === "lte" ? "≤" : ind.target_condition === "eq" ? "=" : "≥";
  const order = ind.code.replace(/\D/g, "");
  const sparkTarget = ind.target_value ?? 100;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-[20px] p-6 transition-shadow hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]",
        "border-t-[3px]",
        pass ? "border-t-[color:var(--success)]" : "border-t-[color:var(--destructive)]",
      )}
    >
      <div className="flex items-center justify-between mb-3.5">
        <span className={cn(
          "text-[11px] font-bold tracking-wide px-3 py-1.5 rounded-full",
          pass ? "bg-[oklch(0.96_0.06_148)] text-[color:var(--success)]" : "bg-[oklch(0.96_0.05_27)] text-[color:var(--destructive)]",
        )}>{ind.code}</span>
        <button
          type="button"
          onClick={onDetail}
          className="text-[12px] font-bold text-[color:var(--primary)] bg-[oklch(0.96_0.04_260)] hover:bg-[oklch(0.94_0.06_260)] px-3.5 py-1.5 rounded-full inline-flex items-center gap-1"
        >
          รายละเอียด<ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <p className="text-[17px] font-bold leading-tight m-0">{ind.name_th}</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">หมวดที่ {order}</p>
      <div className={cn("text-[34px] font-extrabold leading-none tabular-nums mb-2", pass ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]")}>
        {formatIndicatorValue(ind.code, avg)}%
      </div>
      <div className={cn("text-[13px] font-semibold flex items-center gap-1.5 mb-1.5", pass ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]")}>
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full", pass ? "bg-[color:var(--success)]" : "bg-[color:var(--destructive)]")} />
        {pass ? "ผ่านเกณฑ์เป้าหมาย" : "ไม่ผ่านเกณฑ์เป้าหมาย"}
      </div>
      <div className="text-[13px] text-muted-foreground mb-3">
        เป้าหมาย {targetSym} {ind.target_value?.toFixed(decimalsFor(ind.code)) ?? "—"}%
      </div>

      {/* Slider */}
      <div className="mb-4">
        <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(to right,#BBF0D2 0%,#FDE68A 60%,#FBD5D5 100%)" }}>
          <div className="absolute -top-1 w-0.5 h-4 bg-slate-500" style={{ left: `${targetPct}%` }} />
          <div
            className={cn(
              "absolute top-1/2 w-4 h-4 rounded-full bg-white border-[3px] -translate-x-1/2 -translate-y-1/2",
              pass ? "border-[color:var(--success)]" : "border-[color:var(--destructive)]",
            )}
            style={{ left: `${avgPct}%` }}
          />
          <div
            className={cn("absolute top-3.5 text-[10px] font-bold -translate-x-1/2", pass ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]")}
            style={{ left: `${avgPct}%` }}
          >{lastFilledLabel}</div>
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground mt-5">
          <span>0</span><span>100</span>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="border border-border rounded-[14px] px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground mb-1">เป้า / เฉลี่ย</div>
          <div className="text-[15px] font-bold tabular-nums">
            {ind.target_value?.toFixed(decimalsFor(ind.code)) ?? "—"} / {formatIndicatorValue(ind.code, avg)}
          </div>
        </div>
        <div className="border border-border rounded-[14px] px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground mb-1">ส่วนต่างจากเป้า</div>
          <div className={cn("text-[15px] font-bold tabular-nums", pass ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]")}>
            {diffPct != null ? `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(2)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Trend */}
      <div className="border border-border rounded-[14px] px-3.5 pt-3 pb-2 mb-3.5">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-bold">Trend รายเดือน</span>
          <span className="text-muted-foreground">ต.ค. → ก.ย.</span>
        </div>
        <Sparkline monthly={monthly} target={sparkTarget} pass={pass} code={ind.code} />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{THAI_MONTHS[0]}</span><span>{THAI_MONTHS[11]}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border text-[13px]">
        <span className="text-muted-foreground">เดือนที่ผ่านเกณฑ์</span>
        <span className={cn(
          "text-sm font-extrabold",
          monthsWithData > 0 && monthsPassed / monthsWithData >= 0.5 ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]",
        )}>{monthsPassed}/{monthsWithData} เดือน</span>
      </div>
      {diff != null && <span className="sr-only">{diff}</span>}
    </div>
  );
}

/* --------- Sparkline SVG --------- */
function Sparkline({ monthly, target, pass, code }: { monthly: (number | null)[]; target: number; pass: boolean; code: string }) {
  const [hoverI, setHoverI] = useState<number | null>(null);
  const filled = monthly.map((v, i) => ({ i, v })).filter((x): x is { i: number; v: number } => x.v != null);
  const w = 280, h = 50, pad = 6;
  if (filled.length === 0) {
    return <div className="text-xs text-muted-foreground/70 text-center py-3.5">ยังไม่มีข้อมูล</div>;
  }
  const all = filled.map((f) => f.v).concat([target]);
  const min = Math.min(...all, 75);
  const max = Math.max(...all, 100.5);
  const x = (i: number) => pad + (i / 11) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  const color = pass ? "#16A34A" : "#DC2626";
  const targetY = y(target).toFixed(1);
  const pts = filled.map((f) => `${x(f.i).toFixed(1)},${y(f.v).toFixed(1)}`).join(" ");
  const hovered = hoverI != null ? filled.find((f) => f.i === hoverI) ?? null : null;
  const leftPct = hovered ? (x(hovered.i) / w) * 100 : 0;
  const nearRight = leftPct > 78;
  const nearLeft = leftPct < 12;
  return (
    <div className="relative" onMouseLeave={() => setHoverI(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[54px] overflow-visible">
        <line x1="0" y1={targetY} x2={w} y2={targetY} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 4" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {filled.map((f) => (
          <g key={f.i}>
            <circle cx={x(f.i)} cy={y(f.v)} r={hoverI === f.i ? 5.5 : 4} fill={color} stroke="#fff" strokeWidth={hoverI === f.i ? 1.5 : 0} />
            <rect
              x={x(f.i) - 12} y={0} width={24} height={h}
              fill="transparent"
              onMouseEnter={() => setHoverI(f.i)}
              onClick={() => setHoverI((prev) => (prev === f.i ? null : f.i))}
              style={{ cursor: "pointer" }}
            >
              <title>{`${THAI_MONTHS[f.i]}: ${formatIndicatorValue(code, f.v)}%`}</title>
            </rect>
          </g>
        ))}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute -top-1 z-10 whitespace-nowrap rounded-md bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 shadow-lg"
          style={{
            left: `${leftPct}%`,
            transform: `translate(${nearRight ? "-100%" : nearLeft ? "0%" : "-50%"}, -100%)`,
          }}
        >
          {THAI_MONTHS[hovered.i]}: {formatIndicatorValue(code, hovered.v)}%
        </div>
      )}
    </div>
  );
}

/* --------- Yearly BarChart (custom SVG) --------- */
function YearlyBarChart({
  data,
  yearLabels,
}: {
  data: { objective: Ind; yearValues: (number | null)[]; monthly: (number | null)[] }[];
  yearLabels: string[];
}) {
  const [hover, setHover] = useState<{ oi: number; yi: number; x: number; y: number } | null>(null);
  const W = 1200, H = 340, padL = 40, padB = 40, padT = 20;
  const groupW = (W - padL * 2) / data.length;
  const barGap = 6;
  const barW = (groupW - barGap * 5) / 4;
  const maxV = 100;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto font-[inherit]" preserveAspectRatio="xMidYMid meet">
        {[0, 1, 2, 3, 4].map((g) => {
          const gy = padT + (H - padT - padB) * (1 - g / 4);
          return (
            <g key={g}>
              <line x1={padL} y1={gy} x2={W - padL} y2={gy} stroke="#EEF2F7" strokeWidth={1} />
              <text x={padL - 8} y={gy + 4} fontSize={11} fill="#94A3B8" textAnchor="end">{(g * 25).toFixed(0)}</text>
            </g>
          );
        })}
        <line x1={padL} y1={H - padB} x2={W - padL} y2={H - padB} stroke="#CBD5E1" strokeWidth={1} />
        {data.map((d, oi) => {
          const gx = padL + oi * groupW;
          const shortLabel = d.objective.name_th.replace(/^\d+\./, "");
          return (
            <g key={d.objective.id}>
              {d.yearValues.map((val, yi) => {
                if (val == null) return null;
                const bh = (val / maxV) * (H - padT - padB);
                const bx = gx + barGap + yi * (barW + barGap);
                const by = H - padB - bh;
                return (
                  <g key={yi}>
                    <rect
                      x={bx} y={by} width={barW} height={bh} rx={4}
                      fill={YEAR_COLORS[yi]}
                      style={{ cursor: "pointer" }}
                      onMouseMove={(e) => setHover({ oi, yi, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                    />
                    <text x={bx + barW / 2} y={by - 6} fontSize={11} fill={YEAR_COLORS[yi]} fontWeight={700} textAnchor="middle">
                      {val.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              <text x={gx + groupW / 2} y={H - padB + 22} fontSize={12} fill="#334155" textAnchor="middle">{shortLabel}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <BarTooltip
          x={hover.x} y={hover.y}
          title={`${data[hover.oi].objective.name_th} · ${yearLabels[hover.yi]}`}
          value={data[hover.oi].yearValues[hover.yi]}
          monthly={hover.yi === 3 ? data[hover.oi].monthly : null}
          code={data[hover.oi].objective.code}
        />
      )}
    </div>
  );
}

function BarTooltip({
  x, y, title, value, monthly, code,
}: {
  x: number; y: number; title: string; value: number | null;
  monthly: (number | null)[] | null; code: string;
}) {
  const TT_W = 200;
  const TT_H = monthly ? 260 : 70;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  let left = x + 14;
  if (left + TT_W + 8 > vw) left = Math.max(8, x - TT_W - 14);
  let top = y - 10;
  if (top + TT_H + 8 > vh) top = Math.max(8, vh - TT_H - 8);
  return (
    <div
      className="fixed z-50 pointer-events-none rounded-[10px] bg-slate-800 text-white text-[11px] px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
      style={{ left, top, width: TT_W }}
    >
      <div className="font-bold mb-1.5 text-[12px]">{title}</div>
      {monthly
        ? monthly.map((v, i) => (
            <div key={i} className="flex justify-between gap-3.5 text-slate-300 py-px">
              <span>{THAI_MONTHS[i]}</span>
              <b className="text-white font-semibold">{v != null ? formatIndicatorValue(code, v) + "%" : "—"}</b>
            </div>
          ))
        : (
          <div className="flex justify-between gap-3.5 text-slate-300 py-px">
            <span>ค่าเฉลี่ยรายปี</span>
            <b className="text-white font-semibold">{value != null ? value.toFixed(2) + "%" : "—"}</b>
          </div>
        )}
    </div>
  );
}

function CapaBadge({ status }: { status: "none" | "progress" | "done" }) {
  const map = {
    none: { label: "ยังไม่มี", cls: "bg-[oklch(0.96_0.05_27)] text-[color:var(--destructive)]" },
    progress: { label: "กำลังดำเนินการ", cls: "bg-[oklch(0.96_0.06_60)] text-[color:var(--warning)]" },
    done: { label: "มีแล้ว", cls: "bg-[oklch(0.96_0.06_148)] text-[color:var(--success)]" },
  };
  const m = map[status];
  return <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap", m.cls)}>{m.label}</span>;
}

function StatRow({
  icon, label, value, total, color,
}: { icon: React.ReactNode; label: string; value: number; total: number; color: "green" | "amber" | "red" }) {
  const pct = total ? (value / total) * 100 : 0;
  const barColor = color === "green" ? "#16A34A" : color === "amber" ? "#D97706" : "#DC2626";
  return (
    <div className="flex items-center gap-4 mb-4 last:mb-0">
      <div className="w-[190px] text-[13px] flex items-center gap-1.5">{icon}{label}</div>
      <div className="flex-1 h-2.5 bg-[oklch(0.96_0.008_240)] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="w-20 text-right text-[13px] font-bold tabular-nums">{value}/{total}</div>
    </div>
  );
}
