import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Loader2, FileText, FileSpreadsheet, Eye, CheckCircle2, XCircle } from "lucide-react";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { toneFor, statusLabel, statusBadgeClass, targetSymbol, type Tone } from "@/lib/indicator-status";
import { sortIndicators } from "@/lib/indicator-sort";
import { makeCalcContext, computeMonthly } from "@/lib/indicator-calc";

import { decimalsFor } from "@/lib/indicator-format";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Indicator = {
  id: string; code: string; name_th: string; level: string; parent_id: string | null;
  department_id: string | null; target_value: number | null; target_condition: string | null;
  unit: string | null; is_leaf: boolean; is_inverted: boolean | null;
};
type Meas = { indicator_id: string; period_month: number | null; calculated_value: number | null; numerator: number | null; denominator: number | null };
type Dept = { id: string; name_th: string };

const LEVEL_DEPTH: Record<string, number> = {
  object: 0, objective: 0, kpi: 1, qi: 2, subqi: 3, sub_qi: 3,
};


function ReportsPage() {
  const { hasAnyRole } = useAuth();
  const canCompare = hasAnyRole(["admin", "manager", "auditor"]);
  return (
    <Tabs defaultValue="matrix" className="space-y-4">
      <TabsList>
        <TabsTrigger value="matrix">สรุปรายเดือน</TabsTrigger>
        <TabsTrigger value="annual">รายงานประจำปี</TabsTrigger>
        {canCompare && <TabsTrigger value="compare">เปรียบเทียบสาขา</TabsTrigger>}
        <TabsTrigger value="recording">สถานะการบันทึก</TabsTrigger>
      </TabsList>
      <TabsContent value="matrix"><MatrixSection /></TabsContent>
      <TabsContent value="annual"><AnnualReportSection /></TabsContent>
      {canCompare && <TabsContent value="compare"><CompareSection /></TabsContent>}
      <TabsContent value="recording"><RecordingStatusSection /></TabsContent>
    </Tabs>
  );
}

// ============ SECTION 1: Matrix (per-month) ============
function MatrixSection() {
  const { fiscalYear } = useFiscalYear();
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["report-matrix", fiscalYear],
    queryFn: async () => {
      const [{ data: depts }, { data: inds }, { data: meas }] = await Promise.all([
        supabase.from("departments").select("id, name_th").order("name_th"),
        supabase.from("indicators").select("id, code, name_th, level, parent_id, department_id, target_value, target_condition, unit, is_leaf, is_inverted, frequency, is_active, sort_order").eq("is_active", true).order("sort_order").order("code"),
        supabase.from("measurements").select("indicator_id, period_month, calculated_value, numerator, denominator").eq("fiscal_year", fiscalYear),
      ]);
      return { depts: (depts ?? []) as Dept[], inds: sortIndicators((inds ?? []) as Indicator[]), meas: (meas ?? []) as Meas[] };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const ctx = makeCalcContext(data.inds as never, data.meas as never);

    // dept filter: keep an indicator if itself or any descendant belongs to the dept
    let inds = data.inds;
    if (deptFilter !== "all") {
      const byParent = new Map<string | null, Indicator[]>();
      data.inds.forEach((i) => {
        const arr = byParent.get(i.parent_id) ?? [];
        arr.push(i); byParent.set(i.parent_id, arr);
      });
      const matches = (i: Indicator): boolean =>
        i.department_id === deptFilter || (byParent.get(i.id) ?? []).some(matches);
      inds = data.inds.filter(matches);
    }

    return inds.map((ind) => {
      const monthly = computeMonthly(ind as never, ctx);
      const monthCells = FISCAL_MONTH_TO_CAL.map((cm, i) => {
        const m = ind.is_leaf ? data.meas.find((x) => x.indicator_id === ind.id && x.period_month === cm) : undefined;
        return {
          value: monthly[i],
          numerator: m?.numerator != null ? Number(m.numerator) : null,
          denominator: m?.denominator != null ? Number(m.denominator) : null,
        };
      });
      const valid = monthCells.map((c) => c.value).filter((v): v is number => v != null);
      const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
      const sumN = monthCells.reduce((s, c) => s + (c.numerator ?? 0), 0);
      const sumD = monthCells.reduce((s, c) => s + (c.denominator ?? 0), 0);
      const tone = toneFor(avg, ind.target_value, ind.target_condition, ind.is_inverted);
      return { ind, monthCells, avg, sumN, sumD, tone };
    });
  }, [data, deptFilter]);


  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const fmtPct = (v: number) => v.toFixed(2) + "%";

  const fmtNum = (n: number) => n.toLocaleString("en-US");

  const exportCSV = () => {
    const header = ["รหัส", "ตัวชี้วัด", ...THAI_MONTHS, "เฉลี่ย", "เป้า", "สถานะ"];
    const lines = [header.join(",")];
    rows.forEach(({ ind, monthCells, avg, tone }) => {
      const d = decimalsFor(ind.code);
      lines.push([
        ind.code, `"${ind.name_th}"`,
        ...monthCells.map((c) => c.value == null ? "" : c.value.toFixed(d)),
        avg != null ? avg.toFixed(d) : "",
        ind.target_value != null ? `${targetSymbol(ind.target_condition)}${ind.target_value}` : "",
        statusLabel(tone),
      ].join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `KPI-QI-${fiscalYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">รายงานสรุปผลตัวชี้วัด ปีงบประมาณ {fiscalYear}</CardTitle></CardHeader>
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
              {rows.map(({ ind, monthCells, avg, sumN, sumD, tone }) => {
                const depth = LEVEL_DEPTH[ind.level] ?? 3;
                return (
                <TableRow key={ind.id} className={cn("align-top", depth === 0 && "bg-primary/5", depth === 1 && "bg-muted/30")}>
                  <TableCell className="sticky left-0 bg-card z-10 border-r">
                    <div style={{ paddingLeft: depth * 14 }}>
                      <div className={cn("text-sm leading-tight", depth <= 1 ? "font-bold" : "font-medium")}>{ind.name_th}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{ind.code}</div>
                    </div>
                  </TableCell>

                  {monthCells.map((c, i) => (
                    <MatrixCell key={i} value={c.value} numerator={c.numerator} denominator={c.denominator} ind={ind} fmtPct={fmtPct} fmtNum={fmtNum} />
                  ))}
                  <MatrixCell value={avg} numerator={sumN || null} denominator={sumD || null} ind={ind} fmtPct={fmtPct} fmtNum={fmtNum} emphasize />
                  <TableCell className="text-center text-xs whitespace-nowrap">{ind.target_value != null ? `${targetSymbol(ind.target_condition)}${ind.target_value}${ind.unit ?? "%"}` : "—"}</TableCell>
                  <TableCell className="text-center">
                    {avg == null ? "—" : <Badge className={cn(statusBadgeClass(tone), "whitespace-nowrap")}>{statusLabel(tone)}</Badge>}
                  </TableCell>
                </TableRow>
                );
              })}

            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MatrixCell({ value, numerator, denominator, ind, fmtNum, emphasize }: {
  value: number | null; numerator: number | null; denominator: number | null;
  ind: Indicator; fmtPct: (v: number) => string; fmtNum: (n: number) => string; emphasize?: boolean;
}) {
  if (value == null) {
    return <TableCell className={cn("text-center text-muted-foreground", emphasize && "bg-muted/40 font-semibold")}>—</TableCell>;
  }
  const tone = toneFor(value, ind.target_value, ind.target_condition, ind.is_inverted);
  const toneCls = tone === "green" ? "bg-emerald-50 text-emerald-900"
    : tone === "yellow" ? "bg-amber-50 text-amber-900"
    : tone === "red" ? "bg-rose-50 text-rose-900" : "";
  return (
    <TableCell className={cn("text-center p-2 min-w-[88px]", toneCls, emphasize && "ring-1 ring-inset ring-border")}>
      <div className={cn("font-bold tabular-nums", emphasize ? "text-base" : "text-sm")}>{value.toFixed(decimalsFor(ind.code))}%</div>
      {numerator != null && denominator != null && denominator > 0 && (
        <div className="text-[10px] opacity-70 tabular-nums mt-0.5">{fmtNum(numerator)} / {fmtNum(denominator)}</div>

      )}
    </TableCell>
  );
}

// ============ SECTION 2: Annual Report (Preview + PDF + Excel) ============
function AnnualReportSection() {
  const { fiscalYear, setFiscalYear } = useFiscalYear();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["annual-report", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }, { data: capa }] = await Promise.all([
        supabase.from("indicators").select("id, code, name_th, level, parent_id, department_id, target_value, target_condition, unit, is_leaf, is_inverted, frequency, is_active, sort_order").eq("is_active", true).order("sort_order").order("code"),
        supabase.from("measurements").select("indicator_id, period_month, calculated_value, numerator, denominator").eq("fiscal_year", fiscalYear),
        supabase.from("corrective_actions").select("*").eq("fiscal_year", fiscalYear).order("created_at"),
      ]);
      return { inds: sortIndicators((inds ?? []) as Indicator[]), meas: (meas ?? []) as Meas[], capa: capa ?? [] };
    },
  });

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      // Sheet 1: Objectives summary
      const objectives = data.inds.filter((i) => i.level === "objective" || i.level === "object");
      const objRows: (string | number)[][] = [["วัตถุประสงค์", ...THAI_MONTHS, "เฉลี่ย", "เป้าหมาย", "สถานะ"]];
      objectives.forEach((o) => {
        const monthly = derivedMonthly(data.inds, data.meas, o);
        const avg = avgOf(monthly);
        const tone = toneFor(avg, o.target_value, o.target_condition, o.is_inverted);
        const dO = decimalsFor(o.code);
        objRows.push([
          `${o.code} ${o.name_th}`,
          ...monthly.map((v) => v == null ? "" : Number(v.toFixed(dO))),
          avg == null ? "" : Number(avg.toFixed(dO)),
          o.target_value != null ? `${targetSymbol(o.target_condition)}${o.target_value}` : "",
          statusLabel(tone),
        ]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(objRows), "สรุปวัตถุประสงค์");
      // Per-KPI sheets
      const kpis = data.inds.filter((i) => i.level === "kpi");
      kpis.forEach((kpi) => {
        const leaves = childrenLeavesOf(data.inds, kpi.id);
        const rows: (string | number)[][] = [["รหัส", "ตัวชี้วัด", ...THAI_MONTHS, "เฉลี่ย", "เป้าหมาย", "สถานะ"]];
        const allLeaves = leaves.length > 0 ? leaves : [kpi];
        if (leaves.length > 0) {
          const km = derivedMonthly(data.inds, data.meas, kpi);
          const ka = avgOf(km);
          const dK = decimalsFor(kpi.code);
          rows.push([
            kpi.code, kpi.name_th,
            ...km.map((v) => v == null ? "" : Number(v.toFixed(dK))),
            ka == null ? "" : Number(ka.toFixed(dK)),
            kpi.target_value != null ? `${targetSymbol(kpi.target_condition)}${kpi.target_value}` : "",
            statusLabel(toneFor(ka, kpi.target_value, kpi.target_condition, kpi.is_inverted)),
          ]);
        }
        allLeaves.forEach((ind) => {
          const monthly = FISCAL_MONTH_TO_CAL.map((cm) => {
            const m = data.meas.find((x) => x.indicator_id === ind.id && x.period_month === cm);
            return m?.calculated_value != null ? Number(m.calculated_value) : null;
          });
          const avg = avgOf(monthly);
          const tone = toneFor(avg, ind.target_value, ind.target_condition, ind.is_inverted);
          const dI = decimalsFor(ind.code);
          rows.push([
            ind.code, ind.name_th,
            ...monthly.map((v) => v == null ? "" : Number(v.toFixed(dI))),
            avg == null ? "" : Number(avg.toFixed(dI)),
            ind.target_value != null ? `${targetSymbol(ind.target_condition)}${ind.target_value}` : "",
            statusLabel(tone),
          ]);
        });
        const safeName = kpi.code.replace(/[\\/?*[\]:]/g, "_").slice(0, 28);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safeName);
      });
      // CAPA sheet
      const capaRows: (string | number)[][] = [["เดือน", "ตัวชี้วัด", "ปัญหา", "สาเหตุ", "แผนแก้ไข", "ผู้รับผิดชอบ", "กำหนดเสร็จ", "สถานะ", "ผลการดำเนินการ"]];
      data.capa.forEach((c) => {
        const ind = data.inds.find((i) => i.id === c.indicator_id);
        capaRows.push([
          c.period_month ? THAI_MONTHS[(c.period_month + 2) % 12] : "",
          ind ? `${ind.code} ${ind.name_th}` : "—",
          c.problem_description ?? "", c.root_cause ?? "", c.action_plan ?? "",
          c.responsible_person ?? "", c.due_date ?? "", c.status ?? "", c.result_description ?? "",
        ]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(capaRows), "CAPA-CQI");
      XLSX.writeFile(wb, `รายงานประจำปี-${fiscalYear}.xlsx`);
      toast.success("ส่งออก Excel เรียบร้อย");
    } catch (e) {
      toast.error("ส่งออกไม่สำเร็จ: " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">รายงานประจำปี — สำหรับยื่นตรวจประเมินคุณภาพ</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">ปีงบประมาณ</Label>
            <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2567, 2568, 2569, 2570].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setPreviewOpen(true)} disabled={isLoading || !data}><Eye className="w-4 h-4 mr-2" />Preview</Button>
          <Button variant="outline" onClick={exportExcel} disabled={exporting || !data}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
            Export Excel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          รายงาน PDF จะถูกสร้างจากการเรนเดอร์หน้า Preview เพื่อรักษาการแสดงผลภาษาไทยที่ถูกต้อง (ไม่มีปัญหาวรรณยุกต์ลอย/จม)
          ประกอบด้วย: หน้าปก, สรุปวัตถุประสงค์ 4 ด้าน, KPI รายตัว 11 รายการ, รายละเอียด QI/Sub-QI และสรุป CAPA/CQI
        </p>
        {previewOpen && data && <AnnualReportPreview data={data} fiscalYear={fiscalYear} onClose={() => setPreviewOpen(false)} />}
      </CardContent>
    </Card>
  );
}

function childrenLeavesOf(all: Indicator[], parentId: string): Indicator[] {
  const out: Indicator[] = [];
  const walk = (pid: string) => {
    all.filter((i) => i.parent_id === pid).forEach((c) => {
      if (c.is_leaf) out.push(c);
      else walk(c.id);
    });
  };
  walk(parentId);
  return out;
}
/** All descendants (QI + Sub-QI) in hierarchical order, with depth for indentation. */
function descendantsOf(all: Indicator[], parentId: string): Array<{ ind: Indicator; depth: number }> {
  const out: Array<{ ind: Indicator; depth: number }> = [];
  const walk = (pid: string, depth: number) => {
    all.filter((i) => i.parent_id === pid).forEach((c) => {
      out.push({ ind: c, depth });
      if (!c.is_leaf) walk(c.id, depth + 1);
    });
  };
  walk(parentId, 0);
  return out;
}
const ctxCache = new WeakMap<object, ReturnType<typeof makeCalcContext>>();
/** Monthly derived values for any indicator (handles KPI4 = 100 - avg(QI4.1, QI4.2)). */
function derivedMonthly(all: Indicator[], meas: Meas[], ind: Indicator): (number | null)[] {
  let ctx = ctxCache.get(meas as unknown as object);
  if (!ctx) { ctx = makeCalcContext(all as never, meas as never); ctxCache.set(meas as unknown as object, ctx); }
  return computeMonthly(ind as never, ctx);
}
function avgOf(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null);
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function AnnualReportPreview({ data, fiscalYear, onClose }: { data: { inds: Indicator[]; meas: Meas[]; capa: Array<Record<string, unknown>> }; fiscalYear: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const today = new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  const objectives = data.inds.filter((i) => i.level === "objective" || i.level === "object");
  const kpis = data.inds.filter((i) => i.level === "kpi");

  const generatePDF = async () => {
    if (!ref.current) return;
    setGenerating(true);
    try {
      const [{ default: jsPDF }, html2canvasMod] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = html2canvasMod.default;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageWidth = 210, pageHeight = 297;
      const pages = ref.current.querySelectorAll<HTMLElement>("[data-page]");
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const img = canvas.toDataURL("image/jpeg", 0.92);
        const imgW = pageWidth - 20;
        const imgH = (canvas.height * imgW) / canvas.width;
        if (i > 0) pdf.addPage();
        const h = Math.min(imgH, pageHeight - 20);
        pdf.addImage(img, "JPEG", 10, 10, imgW, h);
      }
      pdf.save(`รายงานประจำปี-${fiscalYear}.pdf`);
      toast.success("ส่งออก PDF เรียบร้อย");
    } catch (e) {
      toast.error("ส่งออก PDF ไม่สำเร็จ: " + (e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Preview รายงานประจำปี {fiscalYear}</span>
            <Button onClick={generatePDF} disabled={generating} size="sm">
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Export PDF
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div ref={ref} className="bg-white text-black space-y-6">
          {/* Page 1: Cover */}
          <div data-page className="border rounded-lg p-12 min-h-[800px] flex flex-col justify-center items-center text-center bg-white">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-8">
              <FileText className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-6">รายงานผลการดำเนินงานตามตัวชี้วัดคุณภาพ</h1>
            <p className="text-lg mb-2">กลุ่มงานเทคนิคการแพทย์และพยาธิวิทยาคลินิก</p>
            <p className="text-lg mb-12">โรงพยาบาลพุทธชินราช พิษณุโลก</p>
            <p className="text-2xl font-semibold mb-2">ปีงบประมาณ พ.ศ. {fiscalYear}</p>
            <p className="text-sm text-gray-600 mt-16">วันที่พิมพ์รายงาน: {today}</p>
          </div>

          {/* Page 2: Objectives */}
          <div data-page className="border rounded-lg p-8 bg-white">
            <h2 className="text-xl font-bold mb-4">สรุปผลตามวัตถุประสงค์ 4 ด้าน</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-left">วัตถุประสงค์</th>
                  {THAI_MONTHS.map((m) => <th key={m} className="border p-1">{m}</th>)}
                  <th className="border p-2">เฉลี่ย</th>
                  <th className="border p-2">เป้า</th>
                  <th className="border p-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {objectives.map((o) => {
                  const monthly = derivedMonthly(data.inds, data.meas, o);
                  const avg = avgOf(monthly);
                  const tone = toneFor(avg, o.target_value, o.target_condition, o.is_inverted);
                  return (
                    <tr key={o.id}>
                      <td className="border p-2"><div className="font-medium">{o.code} {o.name_th}</div></td>
                      {monthly.map((v, i) => <td key={i} className={cn("border p-1 text-center", toneBg(toneFor(v, o.target_value, o.target_condition, o.is_inverted)))}>{v == null ? "—" : v.toFixed(decimalsFor(o.code))}</td>)}
                      <td className={cn("border p-1 text-center font-bold", toneBg(tone))}>{avg == null ? "—" : avg.toFixed(decimalsFor(o.code))}</td>
                      <td className="border p-1 text-center">{o.target_value ?? "—"}</td>
                      <td className={cn("border p-1 text-center font-semibold", toneBg(tone))}>{statusLabel(tone)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Per-objective chart pages */}
          {objectives.map((o) => {
            const monthly = derivedMonthly(data.inds, data.meas, o);
            const chartData = THAI_MONTHS.map((m, i) => ({ month: m, value: monthly[i] }));
            const avg = avgOf(monthly);
            const tone = toneFor(avg, o.target_value, o.target_condition, o.is_inverted);
            const d = decimalsFor(o.code);
            return (
              <div key={o.id} data-page className="border rounded-lg p-6 bg-white">
                <h3 className="text-base font-bold mb-1">{o.code} {o.name_th}</h3>
                <p className="text-xs text-gray-600 mb-3">
                  เป้าหมาย: {targetSymbol(o.target_condition)}{o.target_value ?? "—"}{o.unit ?? "%"} • เฉลี่ย: {avg == null ? "—" : avg.toFixed(d)}% • <span className={cn("font-semibold", tone === "green" ? "text-emerald-700" : tone === "yellow" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "")}>{statusLabel(tone)}</span>
                </p>
                <table className="w-full text-xs border-collapse mb-4">
                  <thead><tr className="bg-gray-100">{THAI_MONTHS.map((m) => <th key={m} className="border p-1">{m}</th>)}<th className="border p-1">เฉลี่ย</th></tr></thead>
                  <tbody><tr>{monthly.map((v, i) => <td key={i} className={cn("border p-1 text-center", toneBg(toneFor(v, o.target_value, o.target_condition, o.is_inverted)))}>{v == null ? "—" : v.toFixed(d)}</td>)}<td className={cn("border p-1 text-center font-bold", toneBg(tone))}>{avg == null ? "—" : avg.toFixed(d)}</td></tr></tbody>
                </table>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(d)} width={d > 2 ? 56 : 40} />
                      <Tooltip formatter={(v: number | string) => (typeof v === "number" ? v.toFixed(d) : v)} />
                      {o.target_value != null && <ReferenceLine y={o.target_value} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "เป้า", fontSize: 10 }} />}
                      <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}

          {/* Pages 3+: per KPI */}
          {kpis.map((kpi) => {
            const leaves = descendantsOf(data.inds, kpi.id);
            const monthly = derivedMonthly(data.inds, data.meas, kpi);
            const chartData = THAI_MONTHS.map((m, i) => ({ month: m, value: monthly[i], target: kpi.target_value ?? null }));
            const avg = avgOf(monthly);
            const tone = toneFor(avg, kpi.target_value, kpi.target_condition, kpi.is_inverted);
            return (
              <div key={kpi.id} data-page className="border rounded-lg p-6 bg-white">
                <h3 className="text-base font-bold mb-1">{kpi.code} {kpi.name_th}</h3>
                <p className="text-xs text-gray-600 mb-3">เป้าหมาย: {targetSymbol(kpi.target_condition)}{kpi.target_value ?? "—"}{kpi.unit ?? "%"} • เฉลี่ย: {avg == null ? "—" : avg.toFixed(decimalsFor(kpi.code))}% • <span className={cn("font-semibold", tone === "green" ? "text-emerald-700" : tone === "yellow" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "")}>{statusLabel(tone)}</span></p>
                <table className="w-full text-xs border-collapse mb-4">
                  <thead><tr className="bg-gray-100">{THAI_MONTHS.map((m) => <th key={m} className="border p-1">{m}</th>)}<th className="border p-1">เฉลี่ย</th></tr></thead>
                  <tbody><tr>{monthly.map((v, i) => <td key={i} className={cn("border p-1 text-center", toneBg(toneFor(v, kpi.target_value, kpi.target_condition, kpi.is_inverted)))}>{v == null ? "—" : v.toFixed(decimalsFor(kpi.code))}</td>)}<td className={cn("border p-1 text-center font-bold", toneBg(tone))}>{avg == null ? "—" : avg.toFixed(decimalsFor(kpi.code))}</td></tr></tbody>
                </table>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(decimalsFor(kpi.code))} width={decimalsFor(kpi.code) > 2 ? 56 : 40} />
                      <Tooltip formatter={(v: number | string) => (typeof v === "number" ? v.toFixed(decimalsFor(kpi.code)) : v)} />
                      {kpi.target_value != null && <ReferenceLine y={kpi.target_value} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "เป้า", fontSize: 10 }} />}
                      <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {leaves.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-1">รายละเอียด Sub-QI:</p>
                    <table className="w-full text-[10px] border-collapse">
                      <thead><tr className="bg-gray-50"><th className="border p-1 text-left">ตัวชี้วัด</th>{THAI_MONTHS.map((m) => <th key={m} className="border p-1">{m}</th>)}<th className="border p-1">เฉลี่ย</th></tr></thead>
                      <tbody>
                        {leaves.map(({ ind: l, depth }) => {
                          const lm = l.is_leaf
                            ? FISCAL_MONTH_TO_CAL.map((cm) => {
                                const m = data.meas.find((x) => x.indicator_id === l.id && x.period_month === cm);
                                return m?.calculated_value != null ? Number(m.calculated_value) : null;
                              })
                            : derivedMonthly(data.inds, data.meas, l);
                          const la = avgOf(lm);
                          return (
                            <tr key={l.id} className={l.is_leaf ? "" : "bg-gray-50 font-semibold"}>
                              <td className="border p-1" style={{ paddingLeft: 4 + depth * 12 }}>{l.code} {l.name_th}</td>
                              {lm.map((v, i) => <td key={i} className={cn("border p-1 text-center", toneBg(toneFor(v, l.target_value, l.target_condition, l.is_inverted)))}>{v == null ? "—" : v.toFixed(decimalsFor(l.code))}</td>)}
                              <td className={cn("border p-1 text-center font-bold", toneBg(toneFor(la, l.target_value, l.target_condition, l.is_inverted)))}>{la == null ? "—" : la.toFixed(decimalsFor(l.code))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Final page: CAPA */}
          <div data-page className="border rounded-lg p-6 bg-white">
            <h2 className="text-xl font-bold mb-4">สรุปปัญหาและการแก้ไข (CAPA/CQI)</h2>
            {data.capa.length === 0 ? (
              <p className="text-sm text-gray-500">ไม่มีรายการในปีงบประมาณนี้</p>
            ) : (
              <table className="w-full text-[10px] border-collapse">
                <thead><tr className="bg-gray-100">
                  <th className="border p-1 text-left">ตัวชี้วัด</th>
                  <th className="border p-1 text-left">ปัญหา</th>
                  <th className="border p-1 text-left">แผนแก้ไข</th>
                  <th className="border p-1">ผู้รับผิดชอบ</th>
                  <th className="border p-1">สถานะ</th>
                  <th className="border p-1 text-left">ผลการดำเนินการ</th>
                </tr></thead>
                <tbody>
                  {data.capa.map((c) => {
                    const ind = data.inds.find((i) => i.id === c.indicator_id);
                    return (
                      <tr key={c.id as string}>
                        <td className="border p-1">{ind ? `${ind.code} ${ind.name_th}` : "—"}</td>
                        <td className="border p-1">{(c.problem_description as string) ?? "—"}</td>
                        <td className="border p-1">{(c.action_plan as string) ?? "—"}</td>
                        <td className="border p-1 text-center">{(c.responsible_person as string) ?? "—"}</td>
                        <td className="border p-1 text-center">{(c.status as string) ?? "—"}</td>
                        <td className="border p-1">{(c.result_description as string) ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toneBg(t: Tone): string {
  return t === "green" ? "bg-emerald-50" : t === "yellow" ? "bg-amber-50" : t === "red" ? "bg-rose-50" : "";
}

// ============ SECTION 3: Cross-department comparison ============
function CompareSection() {
  const { fiscalYear } = useFiscalYear();
  const [qiId, setQiId] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["compare-qi", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }, { data: depts }] = await Promise.all([
        supabase.from("indicators").select("id, code, name_th, level, parent_id, department_id, target_value, target_condition, unit, is_leaf, is_inverted, sort_order").eq("is_active", true).order("sort_order").order("code"),
        supabase.from("measurements").select("indicator_id, period_month, calculated_value").eq("fiscal_year", fiscalYear),
        supabase.from("departments").select("id, name_th"),
      ]);
      return { inds: sortIndicators((inds ?? []) as Indicator[]), meas: (meas ?? []) as Meas[], depts: (depts ?? []) as Dept[] };
    },
  });

  // QIs with multiple sub-QIs in different departments
  const comparableQIs = useMemo(() => {
    if (!data) return [];
    return data.inds.filter((qi) => {
      if (qi.level !== "qi") return false;
      const subs = data.inds.filter((s) => s.parent_id === qi.id);
      const deptIds = new Set(subs.map((s) => s.department_id).filter(Boolean));
      return deptIds.size >= 2;
    });
  }, [data]);

  const chartData = useMemo(() => {
    if (!data || !qiId) return [];
    const subs = data.inds.filter((s) => s.parent_id === qiId);
    return subs.map((s) => {
      const vals = data.meas.filter((m) => m.indicator_id === s.id && m.calculated_value != null).map((m) => Number(m.calculated_value));
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const dept = data.depts.find((d) => d.id === s.department_id);
      return { name: dept?.name_th ?? s.code, value: Number(avg.toFixed(2)) };
    });
  }, [data, qiId]);

  const selectedQi = data?.inds.find((i) => i.id === qiId);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">เปรียบเทียบ Sub-QI ข้ามสาขา ปีงบประมาณ {fiscalYear}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1 flex-1 max-w-md">
            <Label className="text-xs">เลือก QI</Label>
            <Select value={qiId} onValueChange={setQiId}>
              <SelectTrigger><SelectValue placeholder="— เลือก QI ที่มี Sub-QI หลายสาขา —" /></SelectTrigger>
              <SelectContent>
                {comparableQIs.map((q) => <SelectItem key={q.id} value={q.id}>{q.code} {q.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {qiId && chartData.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">เป้าหมาย: {targetSymbol(selectedQi?.target_condition)}{selectedQi?.target_value ?? "—"}{selectedQi?.unit ?? "%"}</p>
            <div style={{ width: "100%", height: 360 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {selectedQi?.target_value != null && <ReferenceLine y={selectedQi.target_value} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "เป้า", fontSize: 10 }} />}
                  <Bar dataKey="value" name="ค่าเฉลี่ยทั้งปี (%)" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {!qiId && <p className="text-sm text-muted-foreground text-center py-10">เลือก QI ด้านบนเพื่อแสดงกราฟเปรียบเทียบ</p>}
      </CardContent>
    </Card>
  );
}

// ============ SECTION 4: Recording status ============
function RecordingStatusSection() {
  const { fiscalYear } = useFiscalYear();
  const { data } = useQuery({
    queryKey: ["recording-status", fiscalYear],
    queryFn: async () => {
      const [{ data: depts }, { data: inds }, { data: meas }] = await Promise.all([
        supabase.from("departments").select("id, name_th").eq("is_active", true).order("name_th"),
        supabase.from("indicators").select("id, department_id").eq("is_active", true).eq("is_leaf", true),
        supabase.from("measurements").select("indicator_id, period_month, status").eq("fiscal_year", fiscalYear),
      ]);
      return { depts: (depts ?? []) as Dept[], inds: (inds ?? []) as { id: string; department_id: string | null }[], meas: (meas ?? []) as Array<{ indicator_id: string; period_month: number; status: string }> };
    },
  });

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const grid = data.depts.map((d) => {
    const deptInds = data.inds.filter((i) => i.department_id === d.id);
    const total = deptInds.length;
    const cells = FISCAL_MONTH_TO_CAL.map((cm) => {
      let entered = 0;
      deptInds.forEach((ind) => {
        const m = data.meas.find((x) => x.indicator_id === ind.id && x.period_month === cm);
        if (m && m.status !== "draft") entered++;
      });
      return { entered, total };
    });
    return { dept: d, cells, total };
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">สถานะการบันทึกข้อมูลรายเดือน ปีงบประมาณ {fiscalYear}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="sticky left-0 bg-muted/40 min-w-[180px]">สาขา</TableHead>
                {THAI_MONTHS.map((m) => <TableHead key={m} className="text-center text-xs">{m}</TableHead>)}
                <TableHead className="text-center text-xs">ตัวชี้วัด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.map(({ dept, cells, total }) => (
                <TableRow key={dept.id}>
                  <TableCell className="sticky left-0 bg-card font-medium text-sm">{dept.name_th}</TableCell>
                  {cells.map((c, i) => {
                    if (c.total === 0) return <TableCell key={i} className="text-center text-muted-foreground">—</TableCell>;
                    const complete = c.entered >= c.total;
                    const partial = c.entered > 0 && !complete;
                    return (
                      <TableCell key={i} className={cn("text-center", complete && "bg-emerald-50", partial && "bg-amber-50", !complete && !partial && "bg-rose-50")}>
                        {complete ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" /> : partial ? <span className="text-xs text-amber-700 font-semibold">{c.entered}/{c.total}</span> : <XCircle className="w-4 h-4 text-rose-500 mx-auto" />}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs text-muted-foreground">{total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />บันทึกครบ</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />บันทึกบางส่วน</span>
          <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-rose-500" />ยังไม่บันทึก</span>
        </div>
      </CardContent>
    </Card>
  );
}
