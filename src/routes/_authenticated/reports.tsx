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

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { fiscalYear } = useFiscalYear();
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["report", fiscalYear],
    queryFn: async () => {
      const [{ data: depts }, { data: inds }, { data: meas }] = await Promise.all([
        supabase.from("departments").select("id, name_th").order("name_th"),
        supabase.from("indicators").select("id, code, name_th, department_id, target_value, target_condition, unit, is_leaf").eq("is_active", true).eq("is_leaf", true).order("code"),
        supabase.from("measurements").select("indicator_id, period_month, calculated_value, status").eq("fiscal_year", fiscalYear),
      ]);
      return { depts: depts ?? [], inds: inds ?? [], meas: meas ?? [] };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const inds = deptFilter === "all" ? data.inds : data.inds.filter((i) => i.department_id === deptFilter);
    return inds.map((ind) => {
      const monthVals = FISCAL_MONTH_TO_CAL.map((cm) => {
        const m = data.meas.find((x) => x.indicator_id === ind.id && x.period_month === cm);
        return m?.calculated_value ?? null;
      });
      const valid = monthVals.filter((v): v is number => v != null);
      const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      const ok = avg != null && ind.target_value != null && checkTarget(avg, ind.target_value, ind.target_condition);
      return { ind, monthVals, avg, ok };
    });
  }, [data, deptFilter]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const exportCSV = () => {
    const header = ["รหัส", "ตัวชี้วัด", ...THAI_MONTHS, "เฉลี่ย", "เป้า", "ผลรวม"];
    const lines = [header.join(",")];
    rows.forEach(({ ind, monthVals, avg, ok }) => {
      lines.push([
        ind.code, `"${ind.name_th}"`,
        ...monthVals.map((v) => v == null ? "" : v.toFixed(2)),
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
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสาขา</SelectItem>
                {data?.depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={exportCSV} variant="outline" className="ml-auto"><Download className="w-4 h-4 mr-2" />ส่งออก CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card min-w-[260px]">ตัวชี้วัด</TableHead>
                  {THAI_MONTHS.map((m) => <TableHead key={m} className="text-center text-xs">{m.slice(0, 3)}</TableHead>)}
                  <TableHead className="text-center">เฉลี่ย</TableHead>
                  <TableHead className="text-center">เป้า</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={16} className="text-center py-10 text-muted-foreground">ไม่มีข้อมูล</TableCell></TableRow>}
                {rows.map(({ ind, monthVals, avg, ok }) => (
                  <TableRow key={ind.id}>
                    <TableCell className="sticky left-0 bg-card">
                      <div className="text-sm font-medium">{ind.name_th}</div>
                      <div className="text-xs text-muted-foreground font-mono">{ind.code}</div>
                    </TableCell>
                    {monthVals.map((v, i) => (
                      <TableCell key={i} className="text-center text-xs">{v != null ? v.toFixed(1) : "—"}</TableCell>
                    ))}
                    <TableCell className="text-center font-semibold">{avg != null ? avg.toFixed(1) + "%" : "—"}</TableCell>
                    <TableCell className="text-center text-xs">{ind.target_value != null ? `${targetSymbol(ind.target_condition)}${ind.target_value}${ind.unit ?? ""}` : "—"}</TableCell>
                    <TableCell className="text-center">
                      {avg == null ? "—" : <Badge variant={ok ? "default" : "destructive"}>{ok ? "ผ่าน" : "ไม่ผ่าน"}</Badge>}
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

function checkTarget(v: number, t: number, c: string | null) {
  if (c === "lte") return v <= t;
  if (c === "eq") return Math.abs(v - t) < 0.001;
  return v >= t;
}
function targetSymbol(c: string | null) { return c === "lte" ? "≤" : c === "eq" ? "=" : "≥"; }
