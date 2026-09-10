import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { formatIndicatorValue, registerIndicatorDecimals, formatTargetValue } from "@/lib/indicator-format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Send, CheckCircle2, History, RefreshCw, ShieldAlert, Unlock, Search, CopyPlus, Upload } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/data-entry/")({
  head: () => ({
    meta: [
      { title: "บันทึกข้อมูลตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "บันทึกผลการดำเนินงานรายเดือนของตัวชี้วัด พร้อมคำนวณค่าร้อยละและส่งค่าขึ้นสู่ตัวชี้วัดระดับบนอัตโนมัติ" },
      { property: "og:title", content: "บันทึกข้อมูลตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "บันทึกผลการดำเนินงานรายเดือนของตัวชี้วัด พร้อมคำนวณค่าร้อยละและส่งค่าขึ้นสู่ตัวชี้วัดระดับบนอัตโนมัติ" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/data-entry" },
      { name: "twitter:title", content: "บันทึกข้อมูลตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "บันทึกผลการดำเนินงานรายเดือนของตัวชี้วัด พร้อมคำนวณค่าร้อยละและส่งค่าขึ้นสู่ตัวชี้วัดระดับบนอัตโนมัติ" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/data-entry" }],
  }),
  component: DataEntryPage,
});

type Indicator = {
  id: string; code: string; name_th: string; department_id: string | null;
  target_value: number | null; target_condition: string | null;
  is_inverted: boolean; unit: string | null;
};
type Measurement = {
  id: string; indicator_id: string; fiscal_year: number; period_month: number | null;
  numerator: number | null; denominator: number | null; calculated_value: number | null;
  status: string; note: string | null;
};
type RowState = { num: string; den: string; dirty: boolean };

const todayCalMonth = new Date().getMonth() + 1;

function DataEntryPage() {
  const { fiscalYear } = useFiscalYear();
  const { hasAnyRole, profile, hasRole, roles } = useAuth();
  const qc = useQueryClient();
  const isStaff = hasRole("staff") && !hasAnyRole(["admin", "manager"]);
  const canApprove = hasAnyRole(["admin", "manager"]);
  const canEnter = hasAnyRole(["admin", "manager", "staff"]);

  const [month, setMonth] = useState<number>(todayCalMonth);
  const [deptId, setDeptId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);


  const { data: depts } = useQuery({
    queryKey: ["depts"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name_th").eq("is_active", true).order("name_th");
      return data ?? [];
    },
  });

  // default dept: staff → their dept; others → first dept
  useEffect(() => {
    if (deptId) return;
    if (isStaff && profile?.department_id) setDeptId(profile.department_id);
    else if (depts && depts.length) setDeptId(depts[0].id);
  }, [depts, profile, isStaff, deptId]);

  const visibleDepts = useMemo(() => {
    if (!depts) return [];
    if (isStaff && profile?.department_id) return depts.filter((d) => d.id === profile.department_id);
    return depts;
  }, [depts, isStaff, profile]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    enabled: !!deptId,
    queryKey: ["data-entry", fiscalYear, month, deptId],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }] = await Promise.all([
        supabase.from("indicators")
          .select("id, code, name_th, department_id, target_value, target_condition, is_inverted, unit")
          .eq("is_active", true).eq("is_leaf", true)
          .eq("department_id", deptId)
          .order("sort_order").order("code"),
        supabase.from("measurements").select("*")
          .eq("fiscal_year", fiscalYear).eq("period_month", month),
      ]);
      const { sortIndicators } = await import("@/lib/indicator-sort");
      registerIndicatorDecimals((inds ?? []) as Indicator[]);
      return { inds: sortIndicators((inds ?? []) as Indicator[]), meas: (meas ?? []) as Measurement[] };
    },
  });

  const measByInd = useMemo(() => {
    const m = new Map<string, Measurement>();
    (data?.meas ?? []).forEach((x) => m.set(x.indicator_id, x));
    return m;
  }, [data]);

  // local edit state
  const [rows, setRows] = useState<Record<string, RowState>>({});
  useEffect(() => {
    if (!data) return;
    const next: Record<string, RowState> = {};
    data.inds.forEach((ind) => {
      const m = measByInd.get(ind.id);
      next[ind.id] = {
        num: m?.numerator?.toString() ?? "",
        den: m?.denominator?.toString() ?? "",
        dirty: false,
      };
    });
    setRows(next);
  }, [data, measByInd]);

  const setRow = (id: string, patch: Partial<RowState>) =>
    setRows((cur) => ({ ...cur, [id]: { ...cur[id], ...patch, dirty: true } }));

  const save = useMutation({
    mutationFn: async (status: "draft" | "submitted" | "approved") => {
      const payloads: Array<{ indicator_id: string; numerator: number | null; denominator: number | null; status: string }> = [];
      for (const ind of data?.inds ?? []) {
        const r = rows[ind.id];
        if (!r) continue;
        const m = measByInd.get(ind.id);
        const isApproved = m?.status === "approved";
        // Skip rows that are already approved unless we're explicitly approving
        if (isApproved && status !== "approved") continue;
        // Only persist if changed or no existing record yet and there's input
        const num = r.num === "" ? null : parseFloat(r.num);
        const den = r.den === "" ? null : parseFloat(r.den);
        if (!m && num == null && den == null) continue;
        if (m && !r.dirty && m.status === status) continue;
        payloads.push({ indicator_id: ind.id, numerator: num, denominator: den, status });
      }
      if (payloads.length === 0) {
        toast.info("ไม่มีข้อมูลใหม่ที่ต้องบันทึก");
        return 0;
      }
      const rowsUpsert = payloads.map((p) => ({
        ...p, fiscal_year: fiscalYear, period_month: month,
      }));
      const { error } = await supabase.from("measurements").upsert(rowsUpsert as never, {
        onConflict: "indicator_id,fiscal_year,period_month",
      });
      if (error) throw error;
      return payloads.length;
    },
    onSuccess: (count) => {
      if (count) toast.success(`บันทึก ${count} รายการเรียบร้อย`);
      qc.invalidateQueries({ queryKey: ["data-entry"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    },
    onError: (e) => {
      const msg = e.message ?? "";
      const isPermission =
        /row-level security|permission denied|violates row-level|42501/i.test(msg);
      if (isPermission) {
        toast.error("บัญชีของคุณไม่มีสิทธิ์บันทึกผลวัด", {
          description:
            "การบันทึกผลวัดต้องเป็นผู้ใช้สิทธิ์ staff (บันทึกได้เฉพาะตัวชี้วัดของหน่วยงานตนเอง), manager หรือ admin (บันทึก/อนุมัติได้ทุกหน่วยงาน) และบัญชีต้องอยู่ในสถานะใช้งาน พร้อมมีหน่วยงานกำกับในโปรไฟล์ — กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์",
          duration: 10000,
        });
        return;
      }
      toast.error("บันทึกไม่สำเร็จ: " + msg);
    },
  });

  const isAdmin = hasRole("admin");

  const unlock = useMutation({
    mutationFn: async (measurementId: string) => {
      const { error } = await supabase
        .from("measurements")
        .update({ status: "draft" })
        .eq("id", measurementId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ปลดล็อกรายการแล้ว สามารถแก้ไขข้อมูลได้");
      qc.invalidateQueries({ queryKey: ["data-entry"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    },
    onError: (e: { message?: string }) =>
      toast.error("ปลดล็อกไม่สำเร็จ: " + (e.message ?? "")),
  });

  const pending = useMemo(() => {
    return (data?.inds ?? []).filter((ind) => {
      const m = measByInd.get(ind.id);
      return !m || m.status === "draft";
    }).length;
  }, [data, measByInd]);

  const visibleInds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.inds ?? []).filter((ind) => {
      if (q && !(ind.code.toLowerCase().includes(q) || ind.name_th.toLowerCase().includes(q))) return false;
      if (onlyPending) {
        const m = measByInd.get(ind.id);
        const r = rows[ind.id];
        const hasInput = !!(r && (r.num !== "" || r.den !== ""));
        if (hasInput || (m && m.calculated_value != null)) return false;
      }
      return true;
    });
  }, [data, search, onlyPending, measByInd, rows]);

  const copyPrev = useMutation({
    mutationFn: async () => {
      const idx = FISCAL_MONTH_TO_CAL.indexOf(month);
      if (idx <= 0) throw new Error("เดือนนี้เป็นเดือนแรกของปีงบประมาณ ไม่มีเดือนก่อนหน้า");
      const prevMonth = FISCAL_MONTH_TO_CAL[idx - 1];
      const ids = (data?.inds ?? []).map((i) => i.id);
      if (!ids.length) return 0;
      const { data: prev, error } = await supabase
        .from("measurements")
        .select("indicator_id, numerator, denominator")
        .eq("fiscal_year", fiscalYear)
        .eq("period_month", prevMonth)
        .in("indicator_id", ids);
      if (error) throw error;
      const byInd = new Map(
        ((prev ?? []) as { indicator_id: string; numerator: number | null; denominator: number | null }[])
          .map((p) => [p.indicator_id, p]),
      );
      let filled = 0;
      setRows((cur) => {
        const next = { ...cur };
        for (const ind of data?.inds ?? []) {
          const m = measByInd.get(ind.id);
          if (m?.status === "approved") continue;
          const r = next[ind.id];
          if (!r || (r.num !== "" || r.den !== "")) continue;
          const p = byInd.get(ind.id);
          if (!p || (p.numerator == null && p.denominator == null)) continue;
          next[ind.id] = {
            num: p.numerator?.toString() ?? "",
            den: p.denominator?.toString() ?? "",
            dirty: true,
          };
          filled++;
        }
        return next;
      });
      return filled;
    },
    onSuccess: (n) => {
      if (n) toast.success(`เติมข้อมูลจากเดือนก่อนหน้า ${n} รายการ — ตรวจทานแล้วกดบันทึก`);
      else toast.info("ไม่มีข้อมูลเดือนก่อนหน้าที่จะเติมในช่องว่าง");
    },
    onError: (e: { message?: string }) => toast.error(e.message ?? "คัดลอกไม่สำเร็จ"),
  });


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">บันทึกข้อมูลตัวชี้วัด</h1>
          <p className="text-sm text-muted-foreground">กรอกผลตัวตั้ง/ตัวหารของตัวชี้วัดระดับล่างสุด ระบบจะคำนวณค่าให้อัตโนมัติ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/data-entry/import"><Upload className="w-4 h-4 mr-2" />นำเข้าจาก Excel</Link></Button>
          <Button asChild variant="outline"><Link to="/data-entry/history"><History className="w-4 h-4 mr-2" />ประวัติการบันทึก</Link></Button>
        </div>

      </div>

      {!canEnter && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-destructive">บัญชีของคุณไม่มีสิทธิ์บันทึกผลวัด</p>
              <p className="text-muted-foreground">
                สิทธิ์ปัจจุบัน: {roles.length ? roles.join(", ") : "ไม่มีสิทธิ์ที่กำหนด"} — การบันทึกผลวัดต้องมีสิทธิ์อย่างใดอย่างหนึ่งดังนี้
              </p>
              <ul className="list-disc pl-5 text-muted-foreground">
                <li><b>staff</b> — บันทึกได้เฉพาะตัวชี้วัดของหน่วยงาน (สาขางาน) ที่ระบุในโปรไฟล์ของตนเอง</li>
                <li><b>manager</b> หรือ <b>admin</b> — บันทึกและอนุมัติได้ทุกหน่วยงาน</li>
              </ul>
              <p className="text-muted-foreground">
                นอกจากนี้บัญชีต้องอยู่ในสถานะใช้งาน (active) และมีหน่วยงานกำกับในโปรไฟล์ — กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์
              </p>
            </div>
          </div>
        </div>
      )}



      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs mb-1 block">ปีงบประมาณ</Label>
            <Input value={fiscalYear} readOnly className="bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">เดือน</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FISCAL_MONTH_TO_CAL.map((cal, i) => (
                  <SelectItem key={cal} value={String(cal)}>{THAI_MONTHS[i]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">สาขางาน</Label>
            <Select value={deptId} onValueChange={setDeptId} disabled={isStaff && visibleDepts.length <= 1}>
              <SelectTrigger><SelectValue placeholder="เลือกสาขา" /></SelectTrigger>
              <SelectContent>
                {visibleDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => refetch()} variant="outline" disabled={isFetching}>
            {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            โหลดข้อมูล
          </Button>
        </CardContent>
        <CardContent className="px-4 pb-4 pt-0 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัสหรือชื่อตัวชี้วัด" className="pl-8" />
          </div>
          <Button variant={onlyPending ? "default" : "outline"} onClick={() => setOnlyPending((v) => !v)}>
            เฉพาะที่ยังไม่บันทึก
          </Button>
          <Button variant="outline" onClick={() => copyPrev.mutate()}
            disabled={copyPrev.isPending || !canEnter || !data?.inds.length}>
            {copyPrev.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CopyPlus className="w-4 h-4 mr-2" />}
            คัดลอกข้อมูลเดือนก่อน
          </Button>
        </CardContent>
      </Card>


      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2 border-b text-sm bg-muted/30">
              <span>
                แสดง <b>{visibleInds.length}</b> จากทั้งหมด <b>{data?.inds.length ?? 0}</b> รายการ
              </span>

              {pending > 0 && <Badge variant="destructive">รอบันทึก {pending} รายการ</Badge>}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">รหัส</TableHead>
                    <TableHead className="min-w-[260px]">ชื่อตัวชี้วัด</TableHead>
                    <TableHead className="w-[120px] text-right">ตัวตั้ง</TableHead>
                    <TableHead className="w-[120px] text-right">ตัวหาร</TableHead>
                    <TableHead className="w-[120px] text-right">ค่าคำนวณ (%)</TableHead>
                    <TableHead className="w-[110px] text-right">เป้าหมาย</TableHead>
                    <TableHead className="w-[110px]">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleInds.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">ไม่พบตัวชี้วัดตามเงื่อนไขที่เลือก</TableCell></TableRow>
                  )}
                  {visibleInds.map((ind) => {

                    const r = rows[ind.id] ?? { num: "", den: "", dirty: false };
                    const m = measByInd.get(ind.id);
                    const num = r.num === "" ? null : parseFloat(r.num);
                    const den = r.den === "" ? null : parseFloat(r.den);
                    const live = num != null && den != null && den !== 0 ? (num / den) * 100 : null;
                    const display = live ?? m?.calculated_value ?? null;
                    const ok = display != null && ind.target_value != null && checkTarget(display, ind.target_value, ind.target_condition);
                    const colorCls = display == null ? "" : ok ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold";
                    const approved = m?.status === "approved";
                    const locked = approved && !isAdmin;
                    return (
                      <TableRow key={ind.id} className={approved ? "bg-emerald-50/30" : ""}>
                        <TableCell className="font-mono text-xs">{ind.code}</TableCell>
                        <TableCell className="text-sm">{ind.name_th}</TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" inputMode="decimal" disabled={locked}
                            value={r.num} onChange={(e) => setRow(ind.id, { num: e.target.value })}
                            className="h-8 text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" inputMode="decimal" disabled={locked}
                            value={r.den} onChange={(e) => setRow(ind.id, { den: e.target.value })}
                            className="h-8 text-right" />
                        </TableCell>
                        <TableCell className={`text-right ${colorCls}`}>
                          {formatIndicatorValue(ind.code, display)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {targetSymbol(ind.target_condition)} {formatTargetValue(ind.code, ind.target_value, "-")}{ind.unit ?? ""}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <StatusBadge status={m?.status} />
                            {approved && isAdmin && m && (
                              <Button size="sm" variant="ghost" className="h-7 px-2"
                                title="ปลดล็อกเพื่อแก้ไข"
                                disabled={unlock.isPending}
                                onClick={() => unlock.mutate(m.id)}>
                                <Unlock className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y">
              {visibleInds.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">ไม่พบตัวชี้วัดตามเงื่อนไขที่เลือก</div>
              )}
              {visibleInds.map((ind) => {
                const r = rows[ind.id] ?? { num: "", den: "", dirty: false };
                const m = measByInd.get(ind.id);
                const num = r.num === "" ? null : parseFloat(r.num);
                const den = r.den === "" ? null : parseFloat(r.den);
                const live = num != null && den != null && den !== 0 ? (num / den) * 100 : null;
                const display = live ?? m?.calculated_value ?? null;
                const ok = display != null && ind.target_value != null && checkTarget(display, ind.target_value, ind.target_condition);
                const colorCls = display == null ? "" : ok ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold";
                const approved = m?.status === "approved";
                const locked = approved && !isAdmin;
                return (
                  <div key={ind.id} className={`p-3 space-y-2 ${approved ? "bg-emerald-50/30" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] text-muted-foreground">{ind.code}</div>
                        <div className="text-sm break-words">{ind.name_th}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <StatusBadge status={m?.status} />
                        {approved && isAdmin && m && (
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="ปลดล็อกเพื่อแก้ไข"
                            disabled={unlock.isPending} onClick={() => unlock.mutate(m.id)}>
                            <Unlock className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] mb-1 block">ตัวตั้ง</Label>
                        <Input type="number" step="0.01" inputMode="decimal" disabled={locked}
                          value={r.num} onChange={(e) => setRow(ind.id, { num: e.target.value })}
                          className="h-9 text-right" />
                      </div>
                      <div>
                        <Label className="text-[11px] mb-1 block">ตัวหาร</Label>
                        <Input type="number" step="0.01" inputMode="decimal" disabled={locked}
                          value={r.den} onChange={(e) => setRow(ind.id, { den: e.target.value })}
                          className="h-9 text-right" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        เป้าหมาย {targetSymbol(ind.target_condition)} {formatTargetValue(ind.code, ind.target_value, "-")}{ind.unit ?? ""}
                      </span>
                      <span className={colorCls}>{formatIndicatorValue(ind.code, display)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 p-3 border-t bg-card/95 backdrop-blur md:bg-muted/20">

              <Button variant="outline" onClick={() => save.mutate("draft")} disabled={save.isPending || !data?.inds.length}>
                {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}<Save className="w-4 h-4 mr-2" />บันทึกร่าง
              </Button>
              <Button onClick={() => save.mutate("submitted")} disabled={save.isPending || !data?.inds.length}>
                <Send className="w-4 h-4 mr-2" />ส่งข้อมูล
              </Button>
              {canApprove && (
                <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => save.mutate("approved")} disabled={save.isPending || !data?.inds.length}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />อนุมัติทั้งหมด
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="outline" className="text-muted-foreground">ยังไม่บันทึก</Badge>;
  if (status === "draft") return <Badge variant="secondary">ฉบับร่าง</Badge>;
  if (status === "submitted") return <Badge className="bg-amber-500 hover:bg-amber-500">ส่งแล้ว</Badge>;
  if (status === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">อนุมัติแล้ว</Badge>;
  return <Badge>{status}</Badge>;
}
function checkTarget(v: number, t: number, c: string | null) {
  if (c === "lte") return v <= t;
  if (c === "eq") return Math.abs(v - t) < 0.001;
  return v >= t;
}
function targetSymbol(c: string | null) { return c === "lte" ? "≤" : c === "eq" ? "=" : "≥"; }
