import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { formatIndicatorValue, decimalsFor, registerIndicatorDecimals, formatTargetValue } from "@/lib/indicator-format";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/indicator/$id")({
  head: () => ({
    meta: [
      { title: "รายละเอียดตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "เจาะลึกผลการดำเนินงานรายตัวชี้วัด แนวโน้มรายเดือน เป้าหมาย และข้อมูลย้อนหลังของกลุ่มงานเทคนิคการแพทย์" },
      { property: "og:title", content: "รายละเอียดตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "เจาะลึกผลการดำเนินงานรายตัวชี้วัด แนวโน้มรายเดือน เป้าหมาย และข้อมูลย้อนหลังของกลุ่มงานเทคนิคการแพทย์" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/dashboard/indicator" },
      { name: "twitter:title", content: "รายละเอียดตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "เจาะลึกผลการดำเนินงานรายตัวชี้วัด แนวโน้มรายเดือน เป้าหมาย และข้อมูลย้อนหลังของกลุ่มงานเทคนิคการแพทย์" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/dashboard/indicator" }],
  }),
  component: IndicatorDetailPage,
});

function IndicatorDetailPage() {
  const { id } = Route.useParams();
  const { fiscalYear } = useFiscalYear();
  const [capaOpen, setCapaOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["indicator-detail", id, fiscalYear],
    queryFn: async () => {
      const [{ data: ind }, { data: meas }, { data: capa }, { data: children }, { data: depts }, { data: profiles }] = await Promise.all([
        supabase.from("indicators").select("*").eq("id", id).single(),
        supabase.from("measurements").select("*").eq("indicator_id", id).eq("fiscal_year", fiscalYear).order("period_month"),
        supabase.from("corrective_actions").select("*").eq("indicator_id", id).order("created_at", { ascending: false }),
        supabase.from("indicators").select("id, code, name_th, department_id, target_value, target_condition, is_inverted").eq("parent_id", id),
        supabase.from("departments").select("id, name_th"),
        supabase.from("profiles").select("id, full_name"),
      ]);
      let childMeas: any[] = [];
      if (children && children.length > 0) {
        const { data: cm } = await supabase.from("measurements").select("indicator_id, period_month, calculated_value").eq("fiscal_year", fiscalYear).in("indicator_id", children.map((c) => c.id));
        childMeas = cm ?? [];
      }
      return { ind, meas: meas ?? [], capa: capa ?? [], children: children ?? [], childMeas, depts: depts ?? [], profiles: profiles ?? [] };
    },
  });

  if (isLoading || !data?.ind) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const ind = data.ind;
  const deptName = data.depts.find((d) => d.id === ind.department_id)?.name_th ?? "—";
  const userName = (uid: string | null) => uid ? data.profiles.find((p) => p.id === uid)?.full_name ?? "—" : "—";

  const chartData = FISCAL_MONTH_TO_CAL.map((cm, i) => {
    const m = data.meas.find((x) => x.period_month === cm);
    return { month: THAI_MONTHS[i], value: m?.calculated_value != null ? Number(m.calculated_value) : null };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-1" />กลับ</Link></Button>
        <Button onClick={() => setCapaOpen(true)}><Plus className="w-4 h-4 mr-1" />เพิ่ม CAPA/CQI</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{ind.name_th}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Info label="รหัส" value={ind.code} />
          <Info label="ระดับ" value={ind.level} />
          <Info label="หน่วยงาน" value={deptName} />
          <Info label="เป้าหมาย" value={ind.target_value != null ? `${formatTargetValue(ind.code, ind.target_value)} ${ind.unit ?? ""}` : "—"} />
          <Info label="ทิศทาง" value={ind.is_inverted ? "ยิ่งน้อยยิ่งดี" : "ยิ่งมากยิ่งดี"} />
          <Info label="ความถี่" value={ind.frequency ?? "—"} />
          <div className="col-span-2 sm:col-span-4">
            <div className="text-xs text-muted-foreground">สูตรคำนวณ</div>
            <div>{ind.formula_description ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">แนวโน้มรายเดือน</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 110]} />
                <Tooltip />
                {ind.target_value != null && <ReferenceLine y={ind.target_value} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: `เป้า ${formatTargetValue(ind.code, ind.target_value)}`, fontSize: 10, position: "right" }} />}
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลรายเดือน</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>เดือน</TableHead><TableHead className="text-right">ตัวตั้ง</TableHead><TableHead className="text-right">ตัวหาร</TableHead>
              <TableHead className="text-right">ค่า %</TableHead><TableHead>สถานะ</TableHead><TableHead>ผู้บันทึก</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {FISCAL_MONTH_TO_CAL.map((cm, i) => {
                const m = data.meas.find((x) => x.period_month === cm);
                return (
                  <TableRow key={cm}>
                    <TableCell className="text-sm">{THAI_MONTHS[i]}</TableCell>
                    <TableCell className="text-right text-sm">{m?.numerator ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{m?.denominator ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatIndicatorValue(ind.code, m?.calculated_value != null ? Number(m.calculated_value) : null)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{m?.status ?? "—"}</Badge></TableCell>
                    <TableCell className="text-sm">{userName(m?.entered_by ?? null)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.children.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">เปรียบเทียบตัวชี้วัดลูก (Sub-QI / สาขา)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ตัวชี้วัด</TableHead>
                {THAI_MONTHS.map((m) => <TableHead key={m} className="text-center text-xs">{m}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {data.children.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to="/dashboard/indicator/$id" params={{ id: c.id }} className="text-sm font-medium hover:underline">{c.name_th}</Link>
                      <div className="text-[10px] text-muted-foreground font-mono">{c.code}</div>
                    </TableCell>
                    {FISCAL_MONTH_TO_CAL.map((cm) => {
                      const m = data.childMeas.find((x: any) => x.indicator_id === c.id && x.period_month === cm);
                      return <TableCell key={cm} className="text-center text-xs">{formatIndicatorValue(c.code, m?.calculated_value != null ? Number(m.calculated_value) : null)}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">CAPA / CQI ที่เกี่ยวข้อง</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>ปัญหา</TableHead><TableHead>แผนแก้ไข</TableHead><TableHead>ผู้รับผิดชอบ</TableHead><TableHead>กำหนด</TableHead><TableHead>สถานะ</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.capa.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">ยังไม่มี CAPA</TableCell></TableRow>}
              {data.capa.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm max-w-[200px] truncate">{c.problem_description}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{c.action_plan}</TableCell>
                  <TableCell className="text-sm">{c.responsible_person ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.due_date ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {capaOpen && <QuickCapaDialog indicatorId={id} fiscalYear={fiscalYear} onClose={() => setCapaOpen(false)} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}

function QuickCapaDialog({ indicatorId, fiscalYear, onClose }: { indicatorId: string; fiscalYear: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ problem_description: "", root_cause: "", action_plan: "", responsible_person: "", due_date: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("corrective_actions").insert({
        indicator_id: indicatorId, fiscal_year: fiscalYear,
        problem_description: form.problem_description, root_cause: form.root_cause || null,
        action_plan: form.action_plan, responsible_person: form.responsible_person || null,
        due_date: form.due_date || null, status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("เพิ่มแล้ว"); qc.invalidateQueries({ queryKey: ["indicator-detail"] }); onClose(); },
    onError: (e) => toast.error("ผิดพลาด: " + e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>เพิ่ม CAPA/CQI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">ปัญหา</Label><Textarea rows={2} value={form.problem_description} onChange={(e) => setForm({ ...form, problem_description: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">สาเหตุราก</Label><Textarea rows={2} value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">แผนแก้ไข</Label><Textarea rows={3} value={form.action_plan} onChange={(e) => setForm({ ...form, action_plan: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">ผู้รับผิดชอบ</Label><Input value={form.responsible_person} onChange={(e) => setForm({ ...form, responsible_person: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">กำหนดเสร็จ</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={!form.problem_description || !form.action_plan || save.isPending}>{save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
