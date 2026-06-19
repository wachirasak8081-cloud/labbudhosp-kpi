import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  downloadTemplate, parseExcel, validateRows,
  type ImportRow, type RowError,
} from "@/lib/indicators-xlsx";

export const Route = createFileRoute("/_authenticated/indicators/import")({
  component: ImportPage,
});

type Summary = { success: number; skipped: number; failed: number; messages: string[] };

function ImportPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const { data: meta } = useQuery({
    queryKey: ["import-meta"],
    queryFn: async () => {
      const [{ data: inds }, { data: depts }] = await Promise.all([
        supabase.from("indicators").select("id, code"),
        supabase.from("departments").select("id, code"),
      ]);
      return {
        existingCodes: new Set((inds ?? []).map((i) => i.code as string)),
        codeToId: new Map((inds ?? []).map((i) => [i.code as string, i.id as string])),
        deptCodeToId: new Map(((depts ?? []) as { id: string; code: string | null }[]).filter((d) => d.code).map((d) => [d.code as string, d.id])),
      };
    },
  });

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setSummary(null);
    try {
      const parsed = await parseExcel(file);
      setRows(parsed);
      if (meta) {
        const errs = validateRows(parsed, meta.existingCodes, new Set(meta.deptCodeToId.keys()));
        setErrors(errs);
      } else {
        setErrors([]);
      }
    } catch (e) {
      toast.error("อ่านไฟล์ไม่สำเร็จ: " + (e as Error).message);
      setRows([]); setErrors([]);
    }
  };

  const errorsByRow = useMemo(() => {
    const m = new Map<number, RowError[]>();
    errors.forEach((e) => { const a = m.get(e.row) ?? []; a.push(e); m.set(e.row, a); });
    return m;
  }, [errors]);

  const importMut = useMutation({
    mutationFn: async (): Promise<Summary> => {
      if (!meta) throw new Error("ยังไม่พร้อม");
      const result: Summary = { success: 0, skipped: 0, failed: 0, messages: [] };
      const order = { object: 0, kpi: 1, qi: 2, subqi: 3 } as const;
      const sorted = [...rows].sort((a, b) => order[a.level] - order[b.level]);
      const codeToId = new Map(meta.codeToId);

      for (const r of sorted) {
        if (meta.existingCodes.has(r.code)) { result.skipped++; continue; }
        const parent_id = r.parent_code ? codeToId.get(r.parent_code) ?? null : null;
        if (r.level !== "object" && !parent_id) {
          result.failed++; result.messages.push(`${r.code}: ไม่พบรหัสแม่ "${r.parent_code}"`); continue;
        }
        const department_id = r.department_code ? meta.deptCodeToId.get(r.department_code) ?? null : null;
        const { data: inserted, error } = await supabase.from("indicators").insert({
          code: r.code, name_th: r.name_th, level: r.level,
          parent_id, department_id,
          formula_description: r.formula_description, formula_link: r.formula_link,
          numerator_description: r.numerator_description, denominator_description: r.denominator_description,
          target_value: r.target_value, target_condition: r.target_condition ?? "gte",
          unit: r.unit ?? "%", frequency: r.frequency ?? "monthly",
          is_leaf: r.is_leaf, is_inverted: r.is_inverted, sort_order: r.sort_order,
        }).select("id").maybeSingle();
        if (error) {
          result.failed++; result.messages.push(`${r.code}: ${error.message}`);
        } else {
          result.success++;
          if (inserted) codeToId.set(r.code, inserted.id);
        }
      }
      return result;
    },
    onSuccess: (res) => {
      setSummary(res);
      toast.success(`นำเข้าสำเร็จ ${res.success} • ข้ามซ้ำ ${res.skipped} • ผิดพลาด ${res.failed}`);
      qc.invalidateQueries({ queryKey: ["indicators-all"] });
      qc.invalidateQueries({ queryKey: ["import-meta"] });
    },
    onError: (e) => toast.error("นำเข้าไม่สำเร็จ: " + e.message),
  });

  if (!canEdit) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">ต้องเป็นผู้ดูแลระบบเท่านั้น</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/indicators"><ArrowLeft className="w-4 h-4 mr-2" />กลับไปหน้าตัวชี้วัด</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="w-4 h-4 mr-2" />ดาวน์โหลด Template
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg py-12 px-6 text-center cursor-pointer transition ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
          >
            <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">ลากไฟล์ Excel มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
            <p className="text-xs text-muted-foreground mt-1">รองรับ .xlsx, .xls</p>
            {fileName && <p className="text-sm text-primary mt-3">ไฟล์: {fileName}</p>}
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 text-sm">
                <span>พบ {rows.length} แถว</span>
                {errors.length > 0 ? (
                  <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />{errors.length} ข้อผิดพลาด</Badge>
                ) : (
                  <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />ตรวจสอบผ่าน</Badge>
                )}
              </div>
              <Button onClick={() => importMut.mutate()} disabled={importMut.isPending || errors.length > 0}>
                {importMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                นำเข้าข้อมูล
              </Button>
            </div>

            <div className="border rounded-md max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>ระดับ</TableHead>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ</TableHead>
                    <TableHead>แม่</TableHead>
                    <TableHead>สาขา</TableHead>
                    <TableHead className="text-right">เป้า</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    const rowNo = idx + 2;
                    const rowErrs = errorsByRow.get(rowNo);
                    return (
                      <TableRow key={idx} className={rowErrs ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs">{rowNo}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.level}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{r.name_th}</TableCell>
                        <TableCell className="font-mono text-xs">{r.parent_code ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.department_code ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs">
                          {r.target_value != null ? `${r.target_condition === "lte" ? "≤" : r.target_condition === "eq" ? "=" : "≥"} ${r.target_value}${r.unit ?? ""}` : "—"}
                        </TableCell>
                        <TableCell>
                          {rowErrs ? (
                            <span className="text-xs text-destructive">{rowErrs.map((e) => `${e.field}: ${e.message}`).join(" • ")}</span>
                          ) : meta?.existingCodes.has(r.code) ? (
                            <Badge variant="outline" className="text-[10px]">ซ้ำ (ข้าม)</Badge>
                          ) : (
                            <Badge className="bg-success text-success-foreground text-[10px]">พร้อมนำเข้า</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="font-semibold">ผลการนำเข้า</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge className="bg-success text-success-foreground">สำเร็จ {summary.success}</Badge>
              <Badge variant="secondary">ข้ามซ้ำ {summary.skipped}</Badge>
              <Badge variant={summary.failed > 0 ? "destructive" : "outline"}>ผิดพลาด {summary.failed}</Badge>
            </div>
            {summary.messages.length > 0 && (
              <ul className="text-xs text-destructive list-disc pl-5 mt-2 max-h-40 overflow-auto">
                {summary.messages.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
