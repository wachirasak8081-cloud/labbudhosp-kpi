import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Indicator = {
  id: string;
  code: string;
  name_th: string;
  department_id: string | null;
  target_value: number | null;
  target_condition: string | null;
  unit: string | null;
  is_leaf: boolean;
  is_inverted: boolean | null;
};
type Meas = {
  indicator_id: string;
  period_month: number | null;
  calculated_value: number | null;
  numerator: number | null;
  denominator: number | null;
};

function ReportsPage() {
  const { fiscalYear } = useFiscalYear();
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["report-matrix", fiscalYear],
    queryFn: async () => {
      const [{ data: depts }, { data: inds }, { data: meas }] = await Promise.all([
        supabase.from("departments").select("id, name_th").order("name_th"),
        supabase.from("indicators").select("id, code, name_th, department_id, target_value, target_condition, unit, is_leaf, is_inverted").eq("is_active", true).eq("is_leaf", true).order("code"),
        supabase.from("measurements").select("indicator_id, period_month, calculated_value, numerator, denominator").eq("fiscal_year", fiscalYear),
      ]);
      return { depts: depts ?? [], inds: (inds ?? []) as Indicator[], meas: (meas ?? []) as Meas[] };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const inds = deptFilter === "all" ? data.inds : data.inds.filter((i) => i.department_id === deptFilter);
    return inds.map((ind) => {
      const monthCells = FISCAL_MONTH_TO_CAL.map((cm) => {
        const m = data.meas.find((x) => x.indicator_id === ind.id && x.period_month === cm);
        return {
          value: m?.calculated_value != null ? Number(m.calculated_value) : null,
          numerator: m?.numerator != null ? Number(m.numerator) : null,
          denominator: m?.denominator != null ? Number(m.denominator) : null,
        };
      });
      const valid = monthCells.map((c) => c.value).filter((v): v is number => v != null);
      const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      const sumN = monthCells.reduce((s, c) => s + (c.numerator ?? 0), 0);
      const sumD = monthCells.reduce((s, c) => s + (c.denominator ?? 0), 0);
      const ok = avg != null && ind.target_value != null && checkTarget(avg, ind.target_value, ind.target_condition, ind.is_inverted);
      return { ind, monthCells, avg, sumN, sumD, ok };
    });
  }, [data, deptFilter]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const fmtPct = (v: number) => v.toFixed(2) + "%";
  const fmtNum = (n: number) => n.toLocaleString("en-US");

  const exportCSV = () => {
    const header = ["รหัส", "ตัวชี้วัด", ...THAI_MONTHS, "เฉลี่ย", "เป้า", "ผลรวม"];
    const lines = [header.join(",")];
    rows.forEach(({ ind, monthCells, avg, ok }) => {
      lines.push([
        ind.code, `"${ind.name_th}"`,
        ...monthCells.map((c) => c.value == null ? "" : c.value.toFixed(2)),
        avg != null ? avg.toFixed(2) : "",
        ind.target_value != null ? `${targetSymbol(ind.target_condition)}${ind.target_value}` : "",
        avg == null ? "" : ok ? "ผ่าน" : "ไม่ผ่าน",
      ].join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `KPI-QI-${fiscalYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">รายงานสรุปผลตัวชี้วัด ปีงบประมาณ {fiscalYear}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Label className="text-sm">สาขางาน</Label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสาขา</SelectItem>
                {data?.depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />ผ่านเกณฑ์</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />ใกล้เกณฑ์ (±2%)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />ต่ำกว่าเกณฑ์</span>
              <Button onClick={exportCSV} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />ส่งออก CSV</Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="sticky left-0 bg-muted/40 z-10 min-w-[280px]">ตัวชี้วัด</TableHead>
                  {THAI_MONTHS.map((m) => <TableHead key={m} className="text-center text-xs font-semibold whitespace-nowrap">{m}</TableHead>)}
                  <TableHead className="text-center font-semibold bg-muted/60">เฉลี่ย</TableHead>
                  <TableHead className="text-center text-xs">เป้าหมาย</TableHead>
                  <TableHead className="text-center text-xs">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={16} className="text-center py-10 text-muted-foreground">ไม่มีข้อมูล</TableCell></TableRow>}
                {rows.map(({ ind, monthCells, avg, sumN, sumD, ok }) => (
                  <TableRow key={ind.id} className="align-top">
                    <TableCell className="sticky left-0 bg-card z-10 border-r">
                      <div className="text-sm font-medium leading-tight">{ind.name_th}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{ind.code}</div>
                    </TableCell>
                    {monthCells.map((c, i) => (
                      <MatrixCell key={i} value={c.value} numerator={c.numerator} denominator={c.denominator} ind={ind} fmtPct={fmtPct} fmtNum={fmtNum} />
                    ))}
                    <MatrixCell value={avg} numerator={sumN || null} denominator={sumD || null} ind={ind} fmtPct={fmtPct} fmtNum={fmtNum} emphasize />
                    <TableCell className="text-center text-xs whitespace-nowrap">{ind.target_value != null ? `${targetSymbol(ind.target_condition)}${ind.target_value}${ind.unit ?? "%"}` : "—"}</TableCell>
                    <TableCell className="text-center">
                      {avg == null ? "—" : <Badge className={cn(ok ? "bg-emerald-600 hover:bg-emerald-600" : "bg-rose-600 hover:bg-rose-600", "text-white")}>{ok ? "ผ่าน" : "ไม่ผ่าน"}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MatrixCell({ value, numerator, denominator, ind, fmtPct, fmtNum, emphasize }: {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  ind: Indicator;
  fmtPct: (v: number) => string;
  fmtNum: (n: number) => string;
  emphasize?: boolean;
}) {
  if (value == null) {
    return <TableCell className={cn("text-center text-muted-foreground", emphasize && "bg-muted/40 font-semibold")}>—</TableCell>;
  }
  const tone = toneFor(value, ind.target_value, ind.target_condition, ind.is_inverted);
  const toneCls = tone === "green"
    ? "bg-emerald-50 text-emerald-900"
    : tone === "yellow"
      ? "bg-amber-50 text-amber-900"
      : tone === "red"
        ? "bg-rose-50 text-rose-900"
        : "";
  return (
    <TableCell className={cn("text-center p-2 min-w-[88px]", toneCls, emphasize && "ring-1 ring-inset ring-border")}> 
      <div className={cn("font-bold tabular-nums", emphasize ? "text-base" : "text-sm")}>{fmtPct(value)}</div>
      {numerator != null && denominator != null && denominator > 0 && (
        <div className="text-[10px] opacity-70 tabular-nums mt-0.5">
          {fmtNum(numerator)} / {fmtNum(denominator)}
        </div>
      )}
    </TableCell>
  );
}

function toneFor(v: number, target: number | null, cond: string | null, inverted: boolean | null): "green" | "yellow" | "red" | null {
  if (target == null) return null;
  const diff = v - target;
  // Inverted indicators: lower is better
  if (inverted || cond === "lte") {
    if (v <= target) return "green";
    if (diff <= 2) return "yellow";
    return "red";
  }
  if (cond === "eq") {
    if (Math.abs(diff) < 0.001) return "green";
    if (Math.abs(diff) <= 2) return "yellow";
    return "red";
  }
  // Default: gte
  if (v >= target) return "green";
  if (diff >= -2) return "yellow";
  return "red";
}

function checkTarget(v: number, t: number, c: string | null, inverted: boolean | null) {
  if (inverted || c === "lte") return v <= t;
  if (c === "eq") return Math.abs(v - t) < 0.001;
  return v >= t;
}
function targetSymbol(c: string | null) { return c === "lte" ? "≤" : c === "eq" ? "=" : "≥"; }
