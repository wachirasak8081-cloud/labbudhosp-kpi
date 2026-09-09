import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  downloadMeasurementTemplate, parseMeasurementExcel, validateMeasurementRows,
  type MeasurementImportRow, type MeasurementRowError,
} from "@/lib/measurements-xlsx";

export const Route = createFileRoute("/_authenticated/data-entry/import")({
  head: () => ({
    meta: [
      { title: "นำเข้าผลวัดรายเดือนจาก Excel — ระบบติดตาม KPI/QI รพ.พุทธชินราช" },
      { name: "description", content: "นำเข้าผลการดำเนินงานรายเดือน (ตัวตั้ง/ตัวหาร) ของตัวชี้วัดจากไฟล์ Excel พร้อมตรวจสอบความถูกต้องก่อนบันทึก" },
      { property: "og:title", content: "นำเข้าผลวัดรายเดือนจาก Excel — ระบบติดตาม KPI/QI รพ.พุทธชินราช" },
      { property: "og:description", content: "นำเข้าผลการดำเนินงานรายเดือน (ตัวตั้ง/ตัวหาร) ของตัวชี้วัดจากไฟล์ Excel พร้อมตรวจสอบความถูกต้องก่อนบันทึก" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/data-entry/import" },
      { name: "twitter:title", content: "นำเข้าผลวัดรายเดือนจาก Excel — ระบบติดตาม KPI/QI รพ.พุทธชินราช" },
      { name: "twitter:description", content: "นำเข้าผลการดำเนินงานรายเดือนของตัวชี้วัดจากไฟล์ Excel" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/data-entry/import" }],
  }),
  component: ImportMeasurementsPage,
});

type Summary = { saved: number; skippedApproved: number; failed: number; messages: string[] };

function monthLabel(cal: number) {
  const i = FISCAL_MONTH_TO_CAL.indexOf(cal);
  return i >= 0 ? THAI_MONTHS[i] : String(cal);
}

function ImportMeasurementsPage() {
  const { fiscalYear } = useFiscalYear();
  const { hasAnyRole, hasRole, profile } = useAuth();
  const canEnter = hasAnyRole(["admin", "manager", "staff"]);
  const isStaff = hasRole("staff") && !hasAnyRole(["admin", "manager"]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<MeasurementImportRow[]>([]);
  const [errors, setErrors] = useState<MeasurementRowError[]>([]);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const { data: meta } = useQuery({
    queryKey: ["measure-import-meta", fiscalYear, profile?.department_id, isStaff],
    queryFn: async () => {
      const { data: inds } = await supabase
        .from("indicators")
        .select("id, code, name_th, department_id")
        .eq("is_active", true)
        .eq("is_leaf", true);
      const list = (inds ?? []) as { id: string; code: string; name_th: string; department_id: string | null }[];
      const leafCodes = new Set(list.map((i) => i.code));
      const codeToId = new Map(list.map((i) => [i.code, i.id]));
      const codeToName = new Map(list.map((i) => [i.code, i.name_th]));
      const allowedCodes = isStaff && profile?.department_id
        ? new Set(list.filter((i) => i.department_id === profile.department_id).map((i) => i.code))
        : null;

      const { data: existing } = await supabase
        .from("measurements")
        .select("indicator_id, period_month, status")
        .eq("fiscal_year", fiscalYear)
        .eq("status", "approved");
      const approved = new Set(
        ((existing ?? []) as { indicator_id: string; period_month: number | null }[])
          .map((m) => `${m.indicator_id}|${m.period_month}`),
      );
      return { leafCodes, codeToId, codeToName, allowedCodes, approved, sampleCodes: list.slice(0, 5).map((i) => i.code) };
    },
  });

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setSummary(null);
    try {
      const parsed = await parseMeasurementExcel(file);
      setRows(parsed);
      if (meta) setErrors(validateMeasurementRows(parsed, meta.leafCodes, meta.allowedCodes));
      else setErrors([]);
    } catch (e) {
      toast.error("อ่านไฟล์ไม่สำเร็จ: " + (e as Error).message);
      setRows([]); setErrors([]);
    }
  };

  const errorsByRow = useMemo(() => {
    const m = new Map<number, MeasurementRowError[]>();
    errors.forEach((e) => m.set(e.row, [...(m.get(e.row) ?? []), e]));
    return m;
  }, [errors]);

  const importer = useMutation({
    mutationFn: async () => {
      if (!meta) throw new Error("ยังโหลดข้อมูลตัวชี้วัดไม่เสร็จ");
      const payload: Array<{
        indicator_id: string; fiscal_year: number; period_month: number;
        numerator: number | null; denominator: number | null; note: string | null; status: string;
      }> = [];
      let skippedApproved = 0;
      rows.forEach((r, i) => {
        if (errorsByRow.has(i + 2)) return;
        const id = meta.codeToId.get(r.code);
        if (!id || r.month == null) return;
        if (meta.approved.has(`${id}|${r.month}`)) { skippedApproved++; return; }
        payload.push({
          indicator_id: id, fiscal_year: fiscalYear, period_month: r.month,
          numerator: r.numerator, denominator: r.denominator, note: r.note, status: "draft",
        });
      });
      if (payload.length === 0) return { saved: 0, skippedApproved, failed: 0, messages: [] } as Summary;

      const messages: string[] = [];
      let saved = 0, failed = 0;
      const CHUNK = 200;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error } = await supabase.from("measurements").upsert(chunk as never, {
          onConflict: "indicator_id,fiscal_year,period_month",
        });
        if (error) { failed += chunk.length; messages.push(error.message); }
        else saved += chunk.length;
      }
      return { saved, skippedApproved, failed, messages } as Summary;
    },
    onSuccess: (s) => {
      setSummary(s);
      if (s.saved) toast.success(`นำเข้าสำเร็จ ${s.saved} รายการ (บันทึกเป็นฉบับร่าง)`);
      else if (s.skippedApproved) toast.info("ทุกแถวถูกข้ามเพราะอนุมัติแล้ว");
      else toast.info("ไม่มีรายการที่นำเข้าได้");
    },
    onError: (e: { message?: string }) => toast.error("นำเข้าไม่สำเร็จ: " + (e.message ?? "")),
  });

  const validCount = rows.length - new Set(errors.map((e) => e.row)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">นำเข้าผลวัดรายเดือนจาก Excel</h1>
          <p className="text-sm text-muted-foreground">
            นำเข้าตัวตั้ง/ตัวหารของตัวชี้วัดระดับล่างสุด ปีงบประมาณ {fiscalYear} — ระบบจะบันทึกเป็นฉบับร่างให้ตรวจทานก่อนส่ง
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/data-entry"><ArrowLeft className="w-4 h-4 mr-2" />กลับหน้าบันทึกข้อมูล</Link>
        </Button>
      </div>

      {!canEnter && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          บัญชีของคุณไม่มีสิทธิ์บันทึกผลวัด กรุณาติดต่อผู้ดูแลระบบ
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadMeasurementTemplate(meta?.sampleCodes ?? [])}>
              <Download className="w-4 h-4 mr-2" />ดาวน์โหลดเทมเพลต
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!canEnter}>
              <Upload className="w-4 h-4 mr-2" />เลือกไฟล์ Excel
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className={`rounded-lg border-2 border-dashed p-8 text-center text-sm ${dragging ? "border-primary bg-accent" : "border-border"}`}
          >
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            {fileName ? <span className="font-medium">{fileName}</span> : "ลากไฟล์ Excel มาวางที่นี่ หรือกดปุ่มเลือกไฟล์"}
            <p className="text-xs text-muted-foreground mt-2">
              คอลัมน์: code (รหัสตัวชี้วัด), month (1-12 หรือชื่อเดือนไทย เช่น ต.ค.), numerator, denominator, note
            </p>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b bg-muted/30 text-sm">
              <span>ทั้งหมด <b>{rows.length}</b> แถว</span>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">พร้อมนำเข้า {validCount}</Badge>
              {errors.length > 0 && <Badge variant="destructive">ผิดพลาด {new Set(errors.map((e) => e.row)).size}</Badge>}
            </div>
            <div className="overflow-x-auto max-h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">แถว</TableHead>
                    <TableHead className="w-[110px]">รหัส</TableHead>
                    <TableHead className="min-w-[220px]">ชื่อตัวชี้วัด</TableHead>
                    <TableHead className="w-[80px]">เดือน</TableHead>
                    <TableHead className="w-[100px] text-right">ตัวตั้ง</TableHead>
                    <TableHead className="w-[100px] text-right">ตัวหาร</TableHead>
                    <TableHead className="min-w-[200px]">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const rowNo = i + 2;
                    const errs = errorsByRow.get(rowNo);
                    const id = meta?.codeToId.get(r.code);
                    const isApproved = !!(id && r.month != null && meta?.approved.has(`${id}|${r.month}`));
                    return (
                      <TableRow key={rowNo} className={errs ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{rowNo}</TableCell>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="text-sm">{meta?.codeToName.get(r.code) ?? "-"}</TableCell>
                        <TableCell className="text-sm">{r.month != null ? monthLabel(r.month) : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{r.numerator ?? "-"}</TableCell>
                        <TableCell className="text-right text-sm">{r.denominator ?? "-"}</TableCell>
                        <TableCell className="text-xs">
                          {errs ? (
                            <span className="text-destructive flex items-start gap-1">
                              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              {errs.map((e) => e.message).join(" / ")}
                            </span>
                          ) : isApproved ? (
                            <span className="text-amber-600">ข้าม (อนุมัติแล้ว)</span>
                          ) : (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />พร้อมนำเข้า
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-end gap-2 p-3 border-t bg-muted/20">
              <Button onClick={() => importer.mutate()} disabled={!canEnter || importer.isPending || validCount === 0}>
                {importer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Upload className="w-4 h-4 mr-2" />นำเข้าข้อมูล {validCount} รายการ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-medium">ผลการนำเข้า</p>
            <p>บันทึกสำเร็จ (ฉบับร่าง): <b className="text-emerald-600">{summary.saved}</b> รายการ</p>
            <p>ข้ามเพราะอนุมัติแล้ว: <b className="text-amber-600">{summary.skippedApproved}</b> รายการ</p>
            {summary.failed > 0 && <p className="text-destructive">ไม่สำเร็จ: {summary.failed} รายการ</p>}
            {summary.messages.map((m, i) => <p key={i} className="text-destructive text-xs">{m}</p>)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
