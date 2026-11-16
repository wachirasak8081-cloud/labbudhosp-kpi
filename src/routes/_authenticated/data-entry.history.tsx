import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { formatIndicatorValue } from "@/lib/indicator-format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/data-entry/history")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "ประวัติการบันทึกข้อมูล — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "ตรวจสอบประวัติการบันทึกและแก้ไขข้อมูลผลการดำเนินงานตัวชี้วัดย้อนหลังของกลุ่มงานเทคนิคการแพทย์" },
      { property: "og:title", content: "ประวัติการบันทึกข้อมูล — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "ตรวจสอบประวัติการบันทึกและแก้ไขข้อมูลผลการดำเนินงานตัวชี้วัดย้อนหลังของกลุ่มงานเทคนิคการแพทย์" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/data-entry/history" },
      { name: "twitter:title", content: "ประวัติการบันทึกข้อมูล — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "ตรวจสอบประวัติการบันทึกและแก้ไขข้อมูลผลการดำเนินงานตัวชี้วัดย้อนหลังของกลุ่มงานเทคนิคการแพทย์" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/data-entry/history" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { fiscalYear } = useFiscalYear();
  const { profile, hasAnyRole } = useAuth();
  const isStaff = !hasAnyRole(["admin", "manager", "auditor"]);

  const [month, setMonth] = useState<string>("all");
  const [deptId, setDeptId] = useState<string>(isStaff && profile?.department_id ? profile.department_id : "all");
  const [status, setStatus] = useState<string>("all");

  const { data: depts } = useQuery({
    queryKey: ["depts"],
    queryFn: async () => (await supabase.from("departments").select("id, name_th").eq("is_active", true).order("name_th")).data ?? [],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["entry-history", fiscalYear, month, deptId, status],
    queryFn: async () => {
      let q = supabase.from("measurements")
        .select("id, fiscal_year, period_month, calculated_value, status, entered_at, entered_by, indicator:indicators!inner(code, name_th, is_leaf, department_id)")
        .eq("fiscal_year", fiscalYear)
        .order("entered_at", { ascending: false })
        .limit(500);
      if (month !== "all") q = q.eq("period_month", parseInt(month, 10));
      if (status !== "all") q = q.eq("status", status);
      const { data: rows, error } = await q;
      if (error) throw error;
      type Row = { id: string; fiscal_year: number; period_month: number | null; calculated_value: number | null; status: string; entered_at: string; entered_by: string | null; indicator: { code: string; name_th: string; is_leaf: boolean; department_id: string | null } };
      let r = (rows ?? []) as unknown as Row[];
      if (deptId !== "all") r = r.filter((x) => x.indicator.department_id === deptId);
      // fetch profile names
      const uids = Array.from(new Set(r.map((x) => x.entered_by).filter(Boolean))) as string[];
      const nameMap = new Map<string, string>();
      if (uids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", uids);
        (ps ?? []).forEach((p) => nameMap.set(p.id, p.full_name));
      }
      return r.map((x) => ({ ...x, entered_by_name: x.entered_by ? nameMap.get(x.entered_by) ?? "—" : "ระบบ (auto)" }));
    },
  });

  const monthLabel = useMemo(() => (cal: number | null) => {
    if (cal == null) return "—";
    const idx = FISCAL_MONTH_TO_CAL.indexOf(cal);
    return idx >= 0 ? THAI_MONTHS[idx] : `เดือน ${cal}`;
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ประวัติการบันทึกข้อมูล</h1>
          <p className="text-sm text-muted-foreground">รายการบันทึกล่าสุด 500 รายการ (รวมค่าที่คำนวณอัตโนมัติ)</p>
        </div>
        <Button asChild variant="outline"><Link to="/data-entry"><ArrowLeft className="w-4 h-4 mr-2" />กลับ</Link></Button>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs mb-1 block">ปีงบประมาณ</Label>
            <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm">{fiscalYear}</div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">เดือน</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกเดือน</SelectItem>
                {FISCAL_MONTH_TO_CAL.map((c, i) => <SelectItem key={c} value={String(c)}>{THAI_MONTHS[i]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">สาขางาน</Label>
            <Select value={deptId} onValueChange={setDeptId} disabled={isStaff}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกสาขา</SelectItem>
                {(depts ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">สถานะ</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="draft">ฉบับร่าง</SelectItem>
                <SelectItem value="submitted">ส่งแล้ว</SelectItem>
                <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ปี</TableHead>
                  <TableHead>เดือน</TableHead>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อตัวชี้วัด</TableHead>
                  <TableHead className="text-right">ค่า (%)</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>ผู้บันทึก</TableHead>
                  <TableHead>วันที่บันทึก</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">ไม่มีข้อมูล</TableCell></TableRow>
                )}
                {(data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.fiscal_year}</TableCell>
                    <TableCell>{monthLabel(r.period_month)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.indicator.code}</TableCell>
                    <TableCell className="text-sm">{r.indicator.name_th}</TableCell>
                    <TableCell className="text-right">{formatIndicatorValue(r.indicator.code, r.calculated_value != null ? Number(r.calculated_value) : null)}</TableCell>
                    <TableCell>
                      {r.status === "draft" && <Badge variant="secondary">ฉบับร่าง</Badge>}
                      {r.status === "submitted" && <Badge className="bg-amber-500 hover:bg-amber-500">ส่งแล้ว</Badge>}
                      {r.status === "approved" && <Badge className="bg-emerald-600 hover:bg-emerald-600">อนุมัติแล้ว</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{r.entered_by_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.entered_at).toLocaleString("th-TH")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
