import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Ind = {
  id: string; code: string; name_th: string; level: string; parent_id: string | null;
  target_value: number | null; target_condition: string | null; is_inverted: boolean | null;
  is_leaf: boolean; is_active: boolean; department_id: string | null;
};
type Meas = {
  indicator_id: string; period_month: number | null; calculated_value: number | null;
  numerator: number | null; denominator: number | null; status: string;
};

function checkTarget(value: number, target: number, condition: string | null, inverted: boolean | null) {
  if (inverted) return value <= target;
  if (condition === "lte") return value <= target;
  if (condition === "eq") return Math.abs(value - target) < 0.001;
  return value >= target;
}
function trafficLight(value: number | null, target: number | null, condition: string | null, inverted: boolean | null) {
  if (value == null || target == null) return "gray";
  if (checkTarget(value, target, condition, inverted)) return "green";
  const diff = Math.abs(value - target);
  if (diff <= 2) return "yellow";
  return "red";
}
const toneClass = (t: string) =>
  t === "green" ? "bg-success/15 text-success-foreground" :
  t === "yellow" ? "bg-warning/20 text-warning-foreground" :
  t === "red" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";

function DashboardPage() {
  const { fiscalYear } = useFiscalYear();
  const [monthFilter, setMonthFilter] = useState<string>("all"); // "all" or calendar month 1..12

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }, { data: capa }] = await Promise.all([
        supabase.from("indicators").select("id, code, name_th, level, parent_id, target_value, target_condition, is_inverted, is_leaf, is_active, department_id, sort_order").eq("is_active", true).order("sort_order").order("code"),
        supabase.from("measurements").select("indicator_id, period_month, calculated_value, numerator, denominator, status").eq("fiscal_year", fiscalYear),
        supabase.from("corrective_actions").select("id, indicator_id, status").eq("fiscal_year", fiscalYear),
      ]);
      return { inds: (inds ?? []) as Ind[], meas: (meas ?? []) as Meas[], capa: capa ?? [] };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const indById = new Map(data.inds.map((i) => [i.id, i]));
    const capaByInd = new Map<string, number>();
    data.capa.forEach((c) => capaByInd.set(c.indicator_id, (capaByInd.get(c.indicator_id) ?? 0) + 1));

    // map ind -> {month -> value}
    const valByInd = new Map<string, Map<number, number>>();
    for (const m of data.meas) {
      if (m.period_month == null || m.calculated_value == null) continue;
      if (!valByInd.has(m.indicator_id)) valByInd.set(m.indicator_id, new Map());
      valByInd.get(m.indicator_id)!.set(m.period_month, Number(m.calculated_value));
    }

    const objectives = data.inds.filter((i) => i.level === "object").sort((a, b) => a.code.localeCompare(b.code));
    const kpis = data.inds.filter((i) => i.level === "kpi").sort((a, b) => {
      const an = parseInt(a.code.replace(/\D/g, ""), 10);
      const bn = parseInt(b.code.replace(/\D/g, ""), 10);
      return an - bn;
    });

    // latest period (max period_month found across all measurements)
    const allMonths = data.meas.map((m) => m.period_month).filter((x): x is number => x != null);
    const latestCal = monthFilter === "all"
      ? (allMonths.length ? Math.max(...allMonths) : null)
      : parseInt(monthFilter, 10);

    const prevCal = latestCal != null ? (() => {
      // previous fiscal month: walk FISCAL_MONTH_TO_CAL
      const idx = FISCAL_MONTH_TO_CAL.indexOf(latestCal);
      if (idx <= 0) return null;
      return FISCAL_MONTH_TO_CAL[idx - 1];
    })() : null;

    const objectiveCards = objectives.map((o) => {
      const months = valByInd.get(o.id);
      const cur = latestCal != null ? months?.get(latestCal) ?? null : null;
      const prev = prevCal != null ? months?.get(prevCal) ?? null : null;
      const trend = cur != null && prev != null ? (cur > prev + 0.01 ? "up" : cur < prev - 0.01 ? "down" : "flat") : null;
      const light = trafficLight(cur ?? null, o.target_value, o.target_condition, o.is_inverted);
      return { ind: o, cur, prev, trend, light };
    });

    // KPI matrix rows
    const kpiRows = kpis.map((k) => {
      const months = valByInd.get(k.id);
      const cells = FISCAL_MONTH_TO_CAL.map((cm) => {
        const v = months?.get(cm) ?? null;
        return { cal: cm, value: v, light: trafficLight(v, k.target_value, k.target_condition, k.is_inverted) };
      });
      const valid = cells.map((c) => c.value).filter((x): x is number => x != null);
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      return { ind: k, cells, avg };
    });

    // Alerts: leaf indicators where latest value is below target
    const alertRows: { ind: Ind; value: number; target: number; diff: number; hasCAPA: boolean }[] = [];
    for (const ind of data.inds) {
      if (!ind.is_leaf) continue;
      const months = valByInd.get(ind.id);
      if (!months || !ind.target_value) continue;
      // find latest month <= latestCal in fiscal order
      let v: number | null = null;
      const order = FISCAL_MONTH_TO_CAL.slice();
      for (let i = order.length - 1; i >= 0; i--) {
        const cm = order[i];
        if (latestCal != null && FISCAL_MONTH_TO_CAL.indexOf(cm) > FISCAL_MONTH_TO_CAL.indexOf(latestCal)) continue;
        if (months.has(cm)) { v = months.get(cm)!; break; }
      }
      if (v == null) continue;
      if (!checkTarget(v, ind.target_value, ind.target_condition, ind.is_inverted)) {
        alertRows.push({
          ind, value: v, target: ind.target_value,
          diff: ind.is_inverted ? v - ind.target_value : ind.target_value - v,
          hasCAPA: (capaByInd.get(ind.id) ?? 0) > 0,
        });
      }
    }

    // Stats: leaf indicator entries for current month
    const curMonth = latestCal ?? new Date().getMonth() + 1;
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

    // chart data: 12 months across all kpis
    const chartData = FISCAL_MONTH_TO_CAL.map((cm, i) => {
      const row: any = { month: THAI_MONTHS[i] };
      kpis.forEach((k) => { row[k.code] = valByInd.get(k.id)?.get(cm) ?? null; });
      return row;
    });

    return { objectiveCards, kpiRows, kpis, alertRows, recorded, pending, awaiting, totalLeaf: leafIds.size, chartData, latestCal };
  }, [data, monthFilter]);

  if (isLoading || !view) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const monthOptions = [
    { v: "all", label: "ทั้งปี" },
    ...FISCAL_MONTH_TO_CAL.map((cm, i) => ({ v: String(cm), label: THAI_MONTHS[i] })),
  ];

  return (
    <div className="space-y-6">
      {/* Section 1: Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">ตัวกรอง:</span>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">ปีงบประมาณ {fiscalYear}</span>
      </div>

      {/* Section 2: Objective Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {view.objectiveCards.map(({ ind, cur, prev, trend, light }) => {
          const pct = cur != null && ind.target_value ? Math.min(100, (cur / ind.target_value) * 100) : 0;
          return (
            <Card key={ind.id} className="overflow-hidden">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground truncate">{ind.name_th}</p>
                <div className="flex items-end justify-between mt-2 gap-2">
                  <div className="text-3xl font-bold">{cur != null ? cur.toFixed(2) : "—"}<span className="text-base font-normal text-muted-foreground">%</span></div>
                  <div className="flex items-center gap-1">
                    <span className={cn("inline-block w-3 h-3 rounded-full", light === "green" ? "bg-success" : light === "yellow" ? "bg-warning" : light === "red" ? "bg-destructive" : "bg-muted-foreground")} />
                    {trend === "up" && <TrendingUp className="w-4 h-4 text-success" />}
                    {trend === "down" && <TrendingDown className="w-4 h-4 text-destructive" />}
                    {trend === "flat" && <Minus className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">เป้าหมาย: {ind.target_value ?? "—"}%</div>
                <Progress value={pct} className="mt-2" />
                {prev != null && cur != null && (
                  <div className="text-[10px] text-muted-foreground mt-1">เทียบเดือนก่อน: {prev.toFixed(2)}% ({(cur - prev >= 0 ? "+" : "")}{(cur - prev).toFixed(2)})</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Section 3: KPI matrix */}
      <Card>
        <CardHeader><CardTitle className="text-base">สรุป KPI 11 หมวด รายเดือน</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background min-w-[260px]">KPI</TableHead>
                  {THAI_MONTHS.map((m) => <TableHead key={m} className="text-center text-xs">{m}</TableHead>)}
                  <TableHead className="text-center text-xs">เฉลี่ย</TableHead>
                  <TableHead className="text-center text-xs">เป้า</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.kpiRows.map(({ ind, cells, avg }) => (
                  <TableRow key={ind.id}>
                    <TableCell className="sticky left-0 bg-background">
                      <div className="font-medium text-sm truncate max-w-[260px]">{ind.name_th}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{ind.code}</div>
                    </TableCell>
                    {cells.map((c, i) => (
                      <TableCell key={i} className={cn("text-center text-xs p-1", toneClass(c.light))}>
                        <Link to="/dashboard/indicator/$id" params={{ id: ind.id }} className="block hover:underline">
                          {c.value != null ? c.value.toFixed(1) : "—"}
                        </Link>
                      </TableCell>
                    ))}
                    <TableCell className="text-center text-xs font-semibold">{avg != null ? avg.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{ind.target_value ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Line chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">แนวโน้ม KPI รายเดือน</CardTitle></CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={view.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "เป้า 100%", fontSize: 10, position: "right" }} />
                {view.kpis.map((k, i) => (
                  <Line key={k.id} type="monotone" dataKey={k.code} stroke={`hsl(${(i * 33) % 360} 65% 50%)`} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Section 5: Alert panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" />ตัวชี้วัดที่ไม่ผ่านเกณฑ์</CardTitle>
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
                {view.alertRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">ทุกตัวชี้วัดผ่านเกณฑ์</TableCell></TableRow>}
                {view.alertRows.slice(0, 15).map((r) => (
                  <TableRow key={r.ind.id}>
                    <TableCell>
                      <Link to="/dashboard/indicator/$id" params={{ id: r.ind.id }} className="font-medium text-sm hover:underline">{r.ind.name_th}</Link>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.ind.code}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.value.toFixed(2)}%</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{r.target}%</TableCell>
                    <TableCell className="text-right text-sm text-destructive">-{r.diff.toFixed(2)}</TableCell>
                    <TableCell>{r.hasCAPA ? <Badge variant="secondary">มีแล้ว</Badge> : <Badge variant="outline">ยังไม่มี</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Section 6: Recording statistics */}
        <Card>
          <CardHeader><CardTitle className="text-base">สถิติการบันทึก (เดือนล่าสุด)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <StatRow icon={<CheckCircle2 className="w-4 h-4 text-success" />} label="บันทึก/อนุมัติแล้ว" value={view.recorded} total={view.totalLeaf} />
            <StatRow icon={<Clock className="w-4 h-4 text-warning" />} label="รออนุมัติ" value={view.awaiting} total={view.totalLeaf} />
            <StatRow icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="ยังไม่บันทึก" value={view.pending} total={view.totalLeaf} />
          </CardContent>
        </Card>
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
        <span className="font-semibold">{value}/{total}</span>
      </div>
      <Progress value={pct} className="mt-1 h-1.5" />
    </div>
  );
}
