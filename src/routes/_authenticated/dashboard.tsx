import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Minus, Loader2, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, Target, Activity,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { sortIndicators } from "@/lib/indicator-sort";
import { formatIndicatorValue, formatDiff, decimalsFor } from "@/lib/indicator-format";
import { toneFor, statusLabel, type Tone } from "@/lib/indicator-status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Ind = {
  id: string; code: string; name_th: string; level: string; parent_id: string | null;
  target_value: number | null; target_condition: string | null; is_inverted: boolean | null;
  is_leaf: boolean; is_active: boolean; department_id: string | null;
  frequency: string | null; sort_order: number | null;
};
type Meas = {
  indicator_id: string; period_month: number | null; calculated_value: number | null;
  numerator: number | null; denominator: number | null; status: string;
};
type Capa = { id: string; indicator_id: string; status: string };
type Annual = { objective_id: string; fiscal_year: number; value: number; note: string | null };

const toneDot = (t: Tone) =>
  t === "green" ? "bg-emerald-500"
    : t === "yellow" ? "bg-amber-500"
    : t === "red" ? "bg-rose-500"
    : "bg-muted-foreground/40";

const toneCellBg = (t: Tone) =>
  t === "green" ? "bg-emerald-50 text-emerald-900"
    : t === "yellow" ? "bg-amber-50 text-amber-900"
    : t === "red" ? "bg-rose-50 text-rose-900"
    : "";

const HISTORICAL_YEARS = [2566, 2567, 2568];

function DashboardPage() {
  const { fiscalYear } = useFiscalYear();
  const [monthFilter, setMonthFilter] = useState<string>("all"); // "all" or cal month
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }, { data: capa }, { data: annual }] = await Promise.all([
        supabase.from("indicators")
          .select("id, code, name_th, level, parent_id, target_value, target_condition, is_inverted, is_leaf, is_active, department_id, frequency, sort_order")
          .eq("is_active", true).order("sort_order").order("code"),
        supabase.from("measurements")
          .select("indicator_id, period_month, calculated_value, numerator, denominator, status")
          .eq("fiscal_year", fiscalYear),
        supabase.from("corrective_actions").select("id, indicator_id, status").eq("fiscal_year", fiscalYear),
        supabase.from("annual_objective_summary").select("objective_id, fiscal_year, value, note"),
      ]);
      return {
        inds: sortIndicators((inds ?? []) as Ind[]),
        meas: (meas ?? []) as Meas[],
        capa: (capa ?? []) as Capa[],
        annual: (annual ?? []) as Annual[],
      };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const capaByInd = new Map<string, number>();
    data.capa.forEach((c) => capaByInd.set(c.indicator_id, (capaByInd.get(c.indicator_id) ?? 0) + 1));

    // ind.id -> Map<calMonth, value>
    const valByInd = new Map<string, Map<number, number>>();
    for (const m of data.meas) {
      if (m.period_month == null || m.calculated_value == null) continue;
      if (!valByInd.has(m.indicator_id)) valByInd.set(m.indicator_id, new Map());
      valByInd.get(m.indicator_id)!.set(m.period_month, Number(m.calculated_value));
    }

    // For yearly indicators, carry-forward the latest value to every fiscal month
    // so aggregation (Objective/KPI cards) uses it consistently.
    for (const ind of data.inds) {
      if (ind.frequency !== "yearly") continue;
      const months = valByInd.get(ind.id);
      if (!months) continue;
      let last: number | null = null;
      for (const cm of FISCAL_MONTH_TO_CAL) {
        if (months.has(cm)) last = months.get(cm)!;
        else if (last != null) months.set(cm, last);
      }
    }

    const objectives = data.inds.filter((i) => i.level === "object");
    const kpis = data.inds.filter((i) => i.level === "kpi");

    // latest fiscal-month index available across all measurements
    const allCalMonths = new Set<number>();
    data.meas.forEach((m) => { if (m.period_month != null && m.calculated_value != null) allCalMonths.add(m.period_month); });
    const latestFiscalIdx = (() => {
      let best = -1;
      for (const cm of allCalMonths) {
        const i = FISCAL_MONTH_TO_CAL.indexOf(cm);
        if (i > best) best = i;
      }
      return best;
    })();
    const latestCal = monthFilter === "all"
      ? (latestFiscalIdx >= 0 ? FISCAL_MONTH_TO_CAL[latestFiscalIdx] : null)
      : parseInt(monthFilter, 10);
    const prevCal = latestCal != null ? (() => {
      const idx = FISCAL_MONTH_TO_CAL.indexOf(latestCal);
      return idx > 0 ? FISCAL_MONTH_TO_CAL[idx - 1] : null;
    })() : null;

    const objectiveCards = objectives.map((o) => {
      const months = valByInd.get(o.id);
      const cur = latestCal != null ? months?.get(latestCal) ?? null : null;
      const prev = prevCal != null ? months?.get(prevCal) ?? null : null;
      const trend = cur != null && prev != null
        ? (cur > prev + 0.01 ? "up" : cur < prev - 0.01 ? "down" : "flat")
        : null;
      const tone = toneFor(cur, o.target_value, o.target_condition, o.is_inverted);
      return { ind: o, cur, prev, trend, tone };
    });

    // KPI card summaries: average / pass-count / diff
    const kpiCards = kpis.map((k) => {
      const months = valByInd.get(k.id);
      const monthly: { cal: number; value: number | null }[] = FISCAL_MONTH_TO_CAL
        .map((cm) => ({ cal: cm, value: months?.get(cm) ?? null }));
      const valid = monthly.map((c) => c.value).filter((x): x is number => x != null);
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      const cur = latestCal != null ? months?.get(latestCal) ?? null : avg;
      const display = cur ?? avg;
      const tone = toneFor(display, k.target_value, k.target_condition, k.is_inverted);
      const pass = monthly.filter((c) =>
        c.value != null && k.target_value != null
        && toneFor(c.value, k.target_value, k.target_condition, k.is_inverted) === "green"
      ).length;
      const diff = display != null && k.target_value != null
        ? (k.is_inverted ? k.target_value - display : display - k.target_value)
        : null;
      return { ind: k, monthly, avg, display, tone, pass, monthsWithData: valid.length, diff };
    });

    // KPI matrix rows
    const kpiRows = kpis.map((k) => {
      const months = valByInd.get(k.id);
      const cells = FISCAL_MONTH_TO_CAL.map((cm) => {
        const v = months?.get(cm) ?? null;
        return { cal: cm, value: v, tone: toneFor(v, k.target_value, k.target_condition, k.is_inverted) };
      });
      const valid = cells.map((c) => c.value).filter((x): x is number => x != null);
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      return { ind: k, cells, avg };
    });

    // Alerts: leaf indicators below target
    const alertRows: { ind: Ind; value: number; target: number; diff: number; hasCAPA: boolean }[] = [];
    for (const ind of data.inds) {
      if (!ind.is_leaf) continue;
      const months = valByInd.get(ind.id);
      if (!months || !ind.target_value) continue;
      let v: number | null = null;
      for (let i = FISCAL_MONTH_TO_CAL.length - 1; i >= 0; i--) {
        const cm = FISCAL_MONTH_TO_CAL[i];
        if (latestCal != null && FISCAL_MONTH_TO_CAL.indexOf(cm) > FISCAL_MONTH_TO_CAL.indexOf(latestCal)) continue;
        if (months.has(cm)) { v = months.get(cm)!; break; }
      }
      if (v == null) continue;
      const t = toneFor(v, ind.target_value, ind.target_condition, ind.is_inverted);
      if (t !== "green") {
        alertRows.push({
          ind, value: v, target: ind.target_value,
          diff: ind.is_inverted ? v - ind.target_value : ind.target_value - v,
          hasCAPA: (capaByInd.get(ind.id) ?? 0) > 0,
        });
      }
    }
    alertRows.sort((a, b) => b.diff - a.diff);

    // Recording stats — for the latest recorded fiscal month
    const curMonth = latestCal ?? (new Date().getMonth() + 1);
    const leafIds = new Set(data.inds.filter((i) => i.is_leaf).map((i) => i.id));
    const statusByLeaf = new Map<string, string>();
    for (const m of data.meas) {
      if (m.period_month !== curMonth) continue;
      if (!leafIds.has(m.indicator_id)) continue;
      statusByLeaf.set(m.indicator_id, m.status);
    }
    let recorded = 0, pending = 0, awaiting = 0;
    for (const id of leafIds) {
      const s = statusByLeaf.get(id);
      if (!s || s === "draft") pending++;
      else if (s === "submitted") awaiting++;
      else recorded++;
    }

    // KPI chart data
    const chartData = FISCAL_MONTH_TO_CAL.map((cm, i) => {
      const row: Record<string, number | string | null> = { month: THAI_MONTHS[i], _cal: cm };
      kpis.forEach((k) => { row[k.code] = valByInd.get(k.id)?.get(cm) ?? null; });
      return row;
    });

    // Historical years table
    const historical = new Map<string, Map<number, number>>();
    data.annual.forEach((a) => {
      if (!historical.has(a.objective_id)) historical.set(a.objective_id, new Map());
      historical.get(a.objective_id)!.set(a.fiscal_year, Number(a.value));
    });
    const currentByObjective = new Map<string, number | null>();
    objectiveCards.forEach((o) => {
      const months = valByInd.get(o.ind.id);
      const valid = months ? Array.from(months.values()).filter((x): x is number => x != null) : [];
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      // Prefer stored annual entry for current fiscalYear; else use computed avg
      const stored = historical.get(o.ind.id)?.get(fiscalYear);
      currentByObjective.set(o.ind.id, stored ?? avg);
    });

    return {
      objectiveCards, kpiCards, kpiRows, kpis, alertRows,
      recorded, pending, awaiting, totalLeaf: leafIds.size,
      chartData, latestCal, historical, currentByObjective,
    };
  }, [data, monthFilter, fiscalYear]);

  if (isLoading || !view || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const monthOptions = [
    { v: "all", label: "ทั้งปี" },
    ...FISCAL_MONTH_TO_CAL.map((cm, i) => ({ v: String(cm), label: THAI_MONTHS[i] })),
  ];
  const latestLabel = view.latestCal != null
    ? THAI_MONTHS[FISCAL_MONTH_TO_CAL.indexOf(view.latestCal)]
    : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">แดชบอร์ดภาพรวม</h1>
          <p className="text-sm text-muted-foreground">ปีงบประมาณ {fiscalYear} · อัปเดตล่าสุด {latestLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">ตัวกรอง:</span>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Objective Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {view.objectiveCards.map(({ ind, cur, prev, trend, tone }) => {
          const pct = cur != null && ind.target_value ? Math.min(100, (cur / ind.target_value) * 100) : 0;
          return (
            <Card key={ind.id} className="overflow-hidden">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground truncate" title={ind.name_th}>{ind.name_th}</p>
                <div className="flex items-end justify-between mt-2 gap-2">
                  <div className="text-3xl font-bold tabular-nums">
                    {formatIndicatorValue(ind.code, cur)}
                    <span className="text-base font-normal text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn("inline-block w-3 h-3 rounded-full", toneDot(tone))} />
                    {trend === "up" && <TrendingUp className="w-4 h-4 text-emerald-600" />}
                    {trend === "down" && <TrendingDown className="w-4 h-4 text-rose-600" />}
                    {trend === "flat" && <Minus className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">เป้าหมาย: {ind.target_value ?? "—"}%</div>
                <Progress value={pct} className="mt-2" />
                {prev != null && cur != null && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    เทียบเดือนก่อน: {formatIndicatorValue(ind.code, prev)}% ({formatDiff(ind.code, cur - prev)})
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Historical years comparison table */}
      <Card>
        <CardHeader><CardTitle className="text-base">เปรียบเทียบผลย้อนหลัง 4 ปีงบประมาณ</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">ปีงบประมาณ</TableHead>
                {view.objectiveCards.map(({ ind }) => (
                  <TableHead key={ind.id} className="text-center">{ind.name_th}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {HISTORICAL_YEARS.map((y) => (
                <TableRow key={y}>
                  <TableCell className="font-medium">ปี {y}</TableCell>
                  {view.objectiveCards.map(({ ind }) => {
                    const v = view.historical.get(ind.id)?.get(y) ?? null;
                    return <TableCell key={ind.id} className="text-center tabular-nums">{v != null ? v.toFixed(2) : "—"}</TableCell>;
                  })}
                </TableRow>
              ))}
              <TableRow className="bg-emerald-50/40 font-semibold">
                <TableCell>ปี {fiscalYear} <span className="text-[11px] font-normal text-muted-foreground">(ปัจจุบัน)</span></TableCell>
                {view.objectiveCards.map(({ ind }) => {
                  const v = view.currentByObjective.get(ind.id) ?? null;
                  return <TableCell key={ind.id} className="text-center tabular-nums">{v != null ? v.toFixed(2) : "—"}</TableCell>;
                })}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 11 KPI Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">สรุปผล KPI 11 หมวด</h2>
          <span className="text-xs text-muted-foreground">คลิกการ์ดเพื่อดู QI / Sub-QI</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {view.kpiCards.map(({ ind, monthly, avg, display, tone, pass, monthsWithData, diff }) => {
            const passLabel = tone === "green" ? "ผ่านเกณฑ์เป้าหมาย" : "ไม่ผ่านเกณฑ์เป้าหมาย";
            const targetPrefix = ind.target_condition === "lte" ? "≤"
              : ind.target_condition === "eq" ? "="
              : "≥";
            return (
              <button
                key={ind.id}
                type="button"
                onClick={() => navigate({ to: "/dashboard/indicator/$id", params: { id: ind.id } })}
                className="text-left"
              >
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="pt-5 pb-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-mono">{ind.code}</span>
                          <span>·</span>
                          <span>หมวดที่ {ind.code.replace(/\D/g, "")}</span>
                        </div>
                        <div className="text-sm font-semibold leading-tight mt-0.5">{ind.name_th}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold tabular-nums">
                        {formatIndicatorValue(ind.code, display)}
                        <span className="text-sm font-normal text-muted-foreground">%</span>
                      </div>
                      <span className={cn("inline-block w-3 h-3 rounded-full mb-2", toneDot(tone))} />
                    </div>
                    <div className={cn(
                      "text-xs font-medium flex items-center gap-1.5",
                      tone === "green" ? "text-emerald-700" : "text-rose-700",
                    )}>
                      <span className={cn("inline-block w-1.5 h-1.5 rounded-full", toneDot(tone))} />
                      {passLabel}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <InfoLine label="เป้าหมาย" value={`${targetPrefix} ${ind.target_value?.toFixed(decimalsFor(ind.code)) ?? "—"}%`} />
                      <InfoLine label="เฉลี่ย" value={formatIndicatorValue(ind.code, avg, { suffix: "%" })} />
                      <InfoLine
                        label="ส่วนต่าง"
                        value={diff != null ? formatDiff(ind.code, diff) + "%" : "—"}
                        valueClass={diff == null ? "" : diff >= 0 ? "text-emerald-700" : "text-rose-700"}
                      />
                      <InfoLine label="เดือนที่ผ่าน" value={`${pass}/${monthsWithData} เดือน`} />
                    </div>
                    <SparkBar cells={monthly} target={ind.target_value} cond={ind.target_condition} inv={ind.is_inverted} />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Matrix */}
      <Card>
        <CardHeader><CardTitle className="text-base">สรุป KPI 11 หมวด รายเดือน</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background min-w-[240px]">KPI</TableHead>
                  {THAI_MONTHS.map((m) => <TableHead key={m} className="text-center text-xs">{m}</TableHead>)}
                  <TableHead className="text-center text-xs">เฉลี่ย</TableHead>
                  <TableHead className="text-center text-xs">เป้า</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.kpiRows.map(({ ind, cells, avg }) => (
                  <TableRow key={ind.id}>
                    <TableCell className="sticky left-0 bg-background">
                      <div className="font-medium text-sm truncate max-w-[240px]">{ind.name_th}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{ind.code}</div>
                    </TableCell>
                    {cells.map((c, i) => (
                      <TableCell key={i} className={cn("text-center text-xs p-1 tabular-nums", toneCellBg(c.tone))}>
                        <Link to="/dashboard/indicator/$id" params={{ id: ind.id }} className="block hover:underline">
                          {c.value != null ? c.value.toFixed(decimalsFor(ind.code)) : "—"}
                        </Link>
                      </TableCell>
                    ))}
                    <TableCell className="text-center text-xs font-semibold tabular-nums">
                      {formatIndicatorValue(ind.code, avg)}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                      {ind.target_value?.toFixed(decimalsFor(ind.code)) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Line chart with rich hover tooltip */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            แนวโน้ม KPI รายเดือน
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip content={<KpiTooltip kpis={view.kpis} />} />
                <ReferenceLine
                  y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
                  label={{ value: "เป้า 100%", fontSize: 10, position: "right" }}
                />
                {view.kpis.map((k, i) => (
                  <Line
                    key={k.id} type="monotone" dataKey={k.code}
                    name={`${k.code} ${k.name_th}`}
                    stroke={`hsl(${(i * 33) % 360} 65% 45%)`}
                    strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {view.kpis.map((k, i) => (
              <span key={k.id} className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-1 rounded" style={{ background: `hsl(${(i * 33) % 360} 65% 45%)` }} />
                <span className="font-mono">{k.code}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alerts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              ตัวชี้วัดที่ไม่ผ่านเกณฑ์
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ตัวชี้วัด</TableHead>
                  <TableHead className="text-right">ค่าล่าสุด</TableHead>
                  <TableHead className="text-right">เป้าหมาย</TableHead>
                  <TableHead className="text-right">ส่วนต่าง</TableHead>
                  <TableHead>CAPA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.alertRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">ทุกตัวชี้วัดผ่านเกณฑ์</TableCell></TableRow>
                )}
                {view.alertRows.slice(0, 15).map((r) => (
                  <TableRow key={r.ind.id}>
                    <TableCell>
                      <Link to="/dashboard/indicator/$id" params={{ id: r.ind.id }} className="font-medium text-sm hover:underline">
                        {r.ind.name_th}
                      </Link>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.ind.code}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatIndicatorValue(r.ind.code, r.value, { suffix: "%" })}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {r.target.toFixed(decimalsFor(r.ind.code))}%
                    </TableCell>
                    <TableCell className="text-right text-sm text-rose-600 tabular-nums">
                      -{r.diff.toFixed(decimalsFor(r.ind.code))}
                    </TableCell>
                    <TableCell>
                      {r.hasCAPA
                        ? <Badge variant="secondary">มีแล้ว</Badge>
                        : <Badge variant="outline">ยังไม่มี</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recording stats */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4" />สถิติการบันทึก (เดือนล่าสุด)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatRow icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="บันทึก/อนุมัติแล้ว" value={view.recorded} total={view.totalLeaf} />
            <StatRow icon={<Clock className="w-4 h-4 text-amber-500" />} label="รออนุมัติ" value={view.awaiting} total={view.totalLeaf} />
            <StatRow icon={<AlertTriangle className="w-4 h-4 text-rose-600" />} label="ยังไม่บันทึก" value={view.pending} total={view.totalLeaf} />
            <Button asChild className="w-full mt-2"><Link to="/data-entry">ไปยังหน้าบันทึกข้อมูล</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoLine({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", valueClass)}>{value}</span>
    </div>
  );
}

function SparkBar({
  cells, target, cond, inv,
}: {
  cells: { cal: number; value: number | null }[];
  target: number | null; cond: string | null; inv: boolean | null;
}) {
  return (
    <div className="flex items-end gap-[3px] h-8 pt-1 border-t">
      {cells.map((c, i) => {
        const t = toneFor(c.value, target, cond, inv);
        const h = c.value != null ? Math.max(4, Math.min(100, c.value)) : 4;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm",
              c.value == null ? "bg-muted"
                : t === "green" ? "bg-emerald-400"
                : t === "yellow" ? "bg-amber-400"
                : t === "red" ? "bg-rose-400"
                : "bg-muted",
            )}
            style={{ height: `${h}%` }}
            title={`${THAI_MONTHS[i]}: ${c.value != null ? c.value.toFixed(2) + "%" : "—"}`}
          />
        );
      })}
    </div>
  );
}

function KpiTooltip({
  active, payload, label, kpis,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null; color?: string }>;
  label?: string;
  kpis: Ind[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const codeToInd = new Map(kpis.map((k) => [k.code, k]));
  return (
    <div className="rounded-md border bg-background/95 backdrop-blur shadow-lg p-3 text-xs max-w-[320px]">
      <div className="font-semibold mb-2 text-sm">เดือน {label}</div>
      <div className="space-y-1">
        {payload
          .filter((p) => p.value != null)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((p) => {
            const ind = codeToInd.get(p.dataKey);
            if (!ind) return null;
            const t = toneFor(p.value, ind.target_value, ind.target_condition, ind.is_inverted);
            return (
              <div key={p.dataKey} className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="font-mono text-[10px] text-muted-foreground w-12 shrink-0">{p.dataKey}</span>
                <span className="flex-1 truncate">{ind.name_th}</span>
                <span className="tabular-nums font-semibold">{formatIndicatorValue(ind.code, p.value)}%</span>
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", toneDot(t))} title={statusLabel(t)} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

function StatRow({ icon, label, value, total }: { icon: React.ReactNode; label: string; value: number; total: number }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">{icon}{label}</span>
        <span className="font-semibold tabular-nums">{value}/{total}</span>
      </div>
      <Progress value={pct} className="mt-1 h-1.5" />
    </div>
  );
}
