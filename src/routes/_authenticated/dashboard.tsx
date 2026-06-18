import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertCircle, Target, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { fiscalYear } = useFiscalYear();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: meas }, { data: depts }, { data: capa }] = await Promise.all([
        supabase.from("indicators").select("id, name_th, level, target_value, target_condition, is_inverted, is_leaf, department_id").eq("is_active", true),
        supabase.from("measurements").select("indicator_id, calculated_value, status, period_month").eq("fiscal_year", fiscalYear),
        supabase.from("departments").select("id, name_th, code").eq("is_active", true),
        supabase.from("corrective_actions").select("id, status").eq("fiscal_year", fiscalYear),
      ]);
      return { inds: inds ?? [], meas: meas ?? [], depts: depts ?? [], capa: capa ?? [] };
    },
  });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const leafInds = data.inds.filter((i) => i.is_leaf);
  const totalIndicators = data.inds.length;
  const totalMeas = data.meas.length;
  const approvedMeas = data.meas.filter((m) => m.status === "approved").length;

  // pass/fail per leaf indicator (latest measurement of FY)
  const latestByInd = new Map<string, number | null>();
  for (const m of data.meas) {
    if (m.calculated_value == null) continue;
    const cur = latestByInd.get(m.indicator_id);
    if (cur == null || (m.period_month ?? 0) > 0) latestByInd.set(m.indicator_id, m.calculated_value);
  }
  let passed = 0, failed = 0;
  for (const ind of leafInds) {
    const v = latestByInd.get(ind.id);
    if (v == null || ind.target_value == null) continue;
    const ok = checkTarget(v, ind.target_value, ind.target_condition);
    if (ok) passed++; else failed++;
  }
  const openCAPA = data.capa.filter((c) => c.status !== "closed").length;

  // chart: per dept count of leaf indicators + pass count
  const deptChart = data.depts.map((d) => {
    const indsInDept = leafInds.filter((i) => i.department_id === d.id);
    const pass = indsInDept.filter((i) => {
      const v = latestByInd.get(i.id);
      return v != null && i.target_value != null && checkTarget(v, i.target_value, i.target_condition);
    }).length;
    return { name: d.name_th, ทั้งหมด: indsInDept.length, ผ่าน: pass };
  });

  const cards = [
    { label: "ตัวชี้วัดทั้งหมด", value: totalIndicators, icon: Target, color: "text-primary" },
    { label: "ผ่านเกณฑ์", value: passed, icon: CheckCircle2, color: "text-success" },
    { label: "ไม่ผ่านเกณฑ์", value: failed, icon: AlertCircle, color: "text-destructive" },
    { label: "CAPA ยังไม่ปิด", value: openCAPA, icon: Activity, color: "text-warning" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">สรุปภาพรวมตัวชี้วัด ปีงบประมาณ {fiscalYear}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-3xl font-bold mt-1">{c.value}</p>
                </div>
                <c.icon className={`w-8 h-8 ${c.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">สถานะตัวชี้วัดตามสาขา</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="ทั้งหมด" fill="oklch(0.75 0.12 145)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ผ่าน" fill="oklch(0.42 0.11 155)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลผลวัดของปีงบประมาณ</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-6 flex-wrap">
            <Stat label="รายการผลวัดทั้งหมด" value={totalMeas} />
            <Stat label="อนุมัติแล้ว" value={approvedMeas} suffix={<Badge variant="outline">รออนุมัติ {totalMeas - approvedMeas}</Badge>} />
            <Stat label="ตัวชี้วัดระดับ Leaf" value={leafInds.length} />
            <Stat label="สาขางาน" value={data.depts.length} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-2xl font-semibold">{value}</p>
        {suffix}
      </div>
    </div>
  );
}

function checkTarget(value: number, target: number, condition: string | null): boolean {
  if (condition === "lte") return value <= target;
  if (condition === "eq") return Math.abs(value - target) < 0.001;
  return value >= target; // default gte
}
