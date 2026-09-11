import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingDown, CheckCircle2, AlertTriangle, ClipboardList } from "lucide-react";
import { sortIndicators } from "@/lib/indicator-sort";
import { makeCalcContext, computeMonthly } from "@/lib/indicator-calc";
import { toneFor, statusLabel, statusBadgeClass, targetSymbol, type Tone } from "@/lib/indicator-status";
import { decimalsFor, registerIndicatorDecimals } from "@/lib/indicator-format";

type Ind = {
  id: string; code: string; name_th: string; level: string; parent_id: string | null;
  target_value: number | null; target_condition: string | null; unit: string | null;
  is_leaf: boolean; is_inverted: boolean | null;
};
type Meas = { indicator_id: string; period_month: number | null; calculated_value: number | null };

function avgOf(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function ExecutiveSummarySection() {
  const { fiscalYear } = useFiscalYear();

  const { data, isLoading } = useQuery({
    queryKey: ["exec-summary", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, meas, { data: capa }] = await Promise.all([
        supabase
          .from("indicators")
          .select("id, code, name_th, level, parent_id, target_value, target_condition, unit, is_leaf, is_inverted, sort_order")
          .eq("is_active", true).order("sort_order").order("code"),
        fetchAll<Meas>((f, t) =>
          supabase.from("measurements").select("indicator_id, period_month, calculated_value")
            .eq("fiscal_year", fiscalYear).range(f, t)),
        supabase.from("corrective_actions").select("id, status, indicator_id").eq("fiscal_year", fiscalYear),
      ]);
      const list = sortIndicators((inds ?? []) as Ind[]) as Ind[];
      registerIndicatorDecimals(list as never);
      return { inds: list, meas: meas ?? [], capa: capa ?? [] };
    },
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const ctx = makeCalcContext(data.inds as never, data.meas as never);
    const value = (i: Ind) => avgOf(computeMonthly(i as never, ctx));
    const objectives = data.inds.filter((i) => i.level === "objective" || i.level === "object");
    const kpis = data.inds.filter((i) => i.level === "kpi");

    const rows = kpis.map((k) => {
      const avg = value(k);
      return { ind: k, avg, tone: toneFor(avg, k.target_value, k.target_condition, k.is_inverted) as Tone };
    });
    const counts = { green: 0, yellow: 0, red: 0, none: 0 } as Record<string, number>;
    rows.forEach((r) => { counts[r.avg == null ? "none" : r.tone] = (counts[r.avg == null ? "none" : r.tone] ?? 0) + 1; });
    const measured = rows.filter((r) => r.avg != null).length;
    const passRate = measured ? (counts.green / measured) * 100 : 0;

    const worst = rows
      .filter((r) => r.avg != null && r.tone !== "green")
      .sort((a, b) => {
        const da = (a.ind.target_value ?? 0) - (a.avg as number);
        const db = (b.ind.target_value ?? 0) - (b.avg as number);
        return db - da;
      })
      .slice(0, 5);

    const capaOpen = data.capa.filter((c) => (c.status as string) !== "closed").length;

    return {
      objectives: objectives.map((o) => ({ ind: o, avg: value(o), tone: toneFor(value(o), o.target_value, o.target_condition, o.is_inverted) as Tone })),
      rows, counts, measured, total: rows.length, passRate, worst,
      capaTotal: data.capa.length, capaOpen,
    };
  }, [data]);

  if (isLoading || !summary) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const fmt = (v: number | null, code: string) => (v == null ? "—" : v.toFixed(decimalsFor(code)));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="ผ่านเป้าหมาย"
          value={`${summary.counts.green ?? 0}/${summary.measured}`} sub={`คิดเป็น ${summary.passRate.toFixed(1)}%`} />
        <StatCard icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} label="เฝ้าระวัง"
          value={String(summary.counts.yellow ?? 0)} sub="KPI ใกล้เป้าหมาย" />
        <StatCard icon={<TrendingDown className="w-4 h-4 text-rose-600" />} label="ต่ำกว่าเป้าหมาย"
          value={String(summary.counts.red ?? 0)} sub="KPI ต้องแก้ไข" />
        <StatCard icon={<ClipboardList className="w-4 h-4 text-primary" />} label="แผนแก้ไข (CAPA)"
          value={`${summary.capaOpen}/${summary.capaTotal}`} sub="ยังไม่ปิดเรื่อง" />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">ภาพรวมความสำเร็จ ปีงบประมาณ {fiscalYear}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>อัตรา KPI ที่ผ่านเป้าหมาย</span>
              <span className="font-semibold">{summary.passRate.toFixed(1)}%</span>
            </div>
            <Progress value={summary.passRate} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.objectives.map((o) => (
              <div key={o.ind.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{o.ind.code}</div>
                    <div className="text-sm font-medium break-words">{o.ind.name_th}</div>
                  </div>
                  <Badge className={statusBadgeClass(o.tone)}>{statusLabel(o.tone)}</Badge>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{fmt(o.avg, o.ind.code)}</span>
                  <span className="text-xs text-muted-foreground">
                    เป้า {o.ind.target_value != null ? `${targetSymbol(o.ind.target_condition)}${o.ind.target_value}` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">ตัวชี้วัดที่ต้องให้ความสำคัญ (5 อันดับ)</CardTitle></CardHeader>
        <CardContent>
          {summary.worst.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">ทุกตัวชี้วัดผ่านเป้าหมาย</div>
          ) : (
            <div className="divide-y">
              {summary.worst.map((r) => (
                <div key={r.ind.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium break-words">{r.ind.code} {r.ind.name_th}</div>
                    <div className="text-xs text-muted-foreground">
                      เป้าหมาย {r.ind.target_value != null ? `${targetSymbol(r.ind.target_condition)}${r.ind.target_value}` : "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-semibold">{fmt(r.avg, r.ind.code)}</div>
                    <Badge className={statusBadgeClass(r.tone)}>{statusLabel(r.tone)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
