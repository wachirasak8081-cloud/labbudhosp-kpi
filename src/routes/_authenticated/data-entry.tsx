import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/data-entry")({
  component: MeasurementsPage,
});

type Indicator = { id: string; code: string; name_th: string; is_leaf: boolean; department_id: string | null; target_value: number | null; target_condition: string | null; is_inverted: boolean; frequency: string | null; unit: string | null };
type Measurement = { id: string; indicator_id: string; fiscal_year: number; period_month: number | null; numerator: number | null; denominator: number | null; calculated_value: number | null; status: string; note: string | null };

function MeasurementsPage() {
  const { fiscalYear } = useFiscalYear();
  const { hasAnyRole, profile, hasRole } = useAuth();
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [editing, setEditing] = useState<{ indicator: Indicator; month: number; existing?: Measurement } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["meas-data", fiscalYear],
    queryFn: async () => {
      const [{ data: depts }, { data: inds }, { data: meas }] = await Promise.all([
        supabase.from("departments").select("id, name_th").eq("is_active", true).order("name_th"),
        supabase.from("indicators").select("id, code, name_th, is_leaf, department_id, target_value, target_condition, is_inverted, frequency, unit").eq("is_active", true).eq("is_leaf", true).order("code"),
        supabase.from("measurements").select("*").eq("fiscal_year", fiscalYear),
      ]);
      return { depts: depts ?? [], inds: (inds ?? []) as Indicator[], meas: (meas ?? []) as Measurement[] };
    },
  });

  const measByKey = useMemo(() => {
    const m = new Map<string, Measurement>();
    (data?.meas ?? []).forEach((x) => m.set(`${x.indicator_id}|${x.period_month ?? 0}`, x));
    return m;
  }, [data]);

  const filteredInds = useMemo(() => {
    const arr = data?.inds ?? [];
    if (deptFilter === "all") return arr;
    if (deptFilter === "mine" && profile?.department_id) return arr.filter((i) => i.department_id === profile.department_id);
    return arr.filter((i) => i.department_id === deptFilter);
  }, [data, deptFilter, profile]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const canEditAny = hasAnyRole(["admin", "staff", "manager"]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm">สาขางาน</Label>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสาขา</SelectItem>
            {profile?.department_id && <SelectItem value="mine">สาขาของฉัน</SelectItem>}
            {data?.depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-auto">ปีงบประมาณ {fiscalYear} — แสดงเฉพาะตัวชี้วัดระดับ Leaf</p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[280px]">ตัวชี้วัด</TableHead>
                {THAI_MONTHS.map((m, idx) => <TableHead key={m} className="text-center min-w-[70px]">{m.slice(0, 3)}<br /><span className="text-[10px] text-muted-foreground">เดือน {idx + 1}</span></TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInds.length === 0 && (
                <TableRow><TableCell colSpan={13} className="text-center py-10 text-muted-foreground">ไม่มีตัวชี้วัดในเงื่อนไขนี้</TableCell></TableRow>
              )}
              {filteredInds.map((ind) => (
                <TableRow key={ind.id}>
                  <TableCell className="sticky left-0 bg-card z-10">
                    <div className="font-medium text-sm">{ind.name_th}</div>
                    <div className="text-xs text-muted-foreground font-mono">{ind.code} · เป้า {targetSymbol(ind.target_condition)} {ind.target_value ?? "-"}{ind.unit ?? ""}</div>
                  </TableCell>
                  {FISCAL_MONTH_TO_CAL.map((calMonth, fmIdx) => {
                    const m = measByKey.get(`${ind.id}|${calMonth}`);
                    const v = m?.calculated_value;
                    const ok = v != null && ind.target_value != null && checkTarget(v, ind.target_value, ind.target_condition);
                    return (
                      <TableCell key={fmIdx} className="text-center p-1">
                        <button
                          onClick={() => canEditAny && setEditing({ indicator: ind, month: calMonth, existing: m })}
                          className={`w-full h-12 rounded text-xs font-medium transition ${
                            v == null ? "bg-muted/40 text-muted-foreground hover:bg-muted" :
                            ok ? "bg-success/15 text-success-foreground hover:bg-success/25 border border-success/30" :
                            "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30"
                          } ${m?.status === "approved" ? "ring-1 ring-primary/40" : ""}`}
                          disabled={!canEditAny}
                          title={m?.status === "approved" ? "อนุมัติแล้ว" : ""}
                        >
                          {v != null ? v.toFixed(1) + "%" : "—"}
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <EntryDialog
          {...editing}
          fiscalYear={fiscalYear}
          canApprove={hasAnyRole(["admin", "manager"])}
          isStaff={hasRole("staff")}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function checkTarget(v: number, t: number, c: string | null) {
  if (c === "lte") return v <= t;
  if (c === "eq") return Math.abs(v - t) < 0.001;
  return v >= t;
}
function targetSymbol(c: string | null) { return c === "lte" ? "≤" : c === "eq" ? "=" : "≥"; }

function EntryDialog({ indicator, month, existing, fiscalYear, canApprove, isStaff, onClose }: {
  indicator: Indicator; month: number; existing?: Measurement; fiscalYear: number;
  canApprove: boolean; isStaff: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [num, setNum] = useState<string>(existing?.numerator?.toString() ?? "");
  const [den, setDen] = useState<string>(existing?.denominator?.toString() ?? "");
  const [note, setNote] = useState<string>(existing?.note ?? "");

  const calc = num && den && parseFloat(den) !== 0 ? (parseFloat(num) / parseFloat(den) * 100) : null;

  const save = useMutation({
    mutationFn: async (status: "draft" | "submitted" | "approved") => {
      const payload = {
        indicator_id: indicator.id, fiscal_year: fiscalYear, period_month: month,
        numerator: num === "" ? null : parseFloat(num),
        denominator: den === "" ? null : parseFloat(den),
        note: note || null, status,
      };
      if (existing) {
        const { error } = await supabase.from("measurements").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("measurements").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("บันทึกผลวัดเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["meas-data"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (e) => toast.error("บันทึกไม่สำเร็จ: " + e.message),
  });

  const fiscalMonthIdx = FISCAL_MONTH_TO_CAL.indexOf(month);
  const monthLabel = fiscalMonthIdx >= 0 ? THAI_MONTHS[fiscalMonthIdx] : "";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{indicator.name_th}</DialogTitle>
          <p className="text-xs text-muted-foreground">{monthLabel} ปีงบประมาณ {fiscalYear}</p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">ตัวตั้ง (Numerator)</Label><Input type="number" step="0.01" value={num} onChange={(e) => setNum(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">ตัวหาร (Denominator)</Label><Input type="number" step="0.01" value={den} onChange={(e) => setDen(e.target.value)} /></div>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            ค่าที่คำนวณได้: <span className="font-semibold">{calc != null ? calc.toFixed(2) + "%" : "—"}</span>
            {calc != null && indicator.target_value != null && (
              <Badge className="ml-2" variant={checkTarget(calc, indicator.target_value, indicator.target_condition) ? "default" : "destructive"}>
                {checkTarget(calc, indicator.target_value, indicator.target_condition) ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์"}
              </Badge>
            )}
          </div>
          <div className="space-y-1"><Label className="text-xs">หมายเหตุ</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          {existing && <p className="text-xs text-muted-foreground">สถานะปัจจุบัน: <Badge variant="outline">{statusLabel(existing.status)}</Badge></p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>ปิด</Button>
          {(!existing || existing.status !== "approved") && (
            <Button variant="secondary" onClick={() => save.mutate(isStaff ? "submitted" : "draft")} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Pencil className="w-4 h-4 mr-2" />บันทึก
            </Button>
          )}
          {canApprove && (
            <Button onClick={() => save.mutate("approved")} disabled={save.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-2" />อนุมัติ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function statusLabel(s: string) { return s === "approved" ? "อนุมัติแล้ว" : s === "submitted" ? "ส่งแล้ว" : "ฉบับร่าง"; }
