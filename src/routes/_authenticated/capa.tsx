import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useAuth } from "@/hooks/use-auth";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { THAI_MONTHS, FISCAL_MONTH_TO_CAL } from "@/lib/fiscal-year";
import { formatIndicatorValue, decimalsFor, registerIndicatorDecimals } from "@/lib/indicator-format";
import {
  APPROVAL_LABEL, EFFECTIVENESS_LABEL, NC_SOURCE_LABEL, PDCA_LABEL, SEVERITY_LABEL, SEVERITY_TONE,
  calcSeverity,
} from "@/lib/capa-helpers";
import { RcaDialog } from "@/components/capa/rca-dialog";
import { KanbanTab } from "@/components/capa/kanban-tab";

export const Route = createFileRoute("/_authenticated/capa")({
  head: () => ({
    meta: [
      { title: "แผนแก้ไข CAPA / CQI — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "บันทึกการวิเคราะห์สาเหตุและติดตามการแก้ไขปรับปรุงตามวงจร PDCA ตามข้อกำหนด ISO 15189 ข้อ 8.7 และ 8.8" },
      { property: "og:title", content: "แผนแก้ไข CAPA / CQI — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "บันทึกการวิเคราะห์สาเหตุและติดตามการแก้ไขปรับปรุงตามวงจร PDCA ตามข้อกำหนด ISO 15189 ข้อ 8.7 และ 8.8" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/capa" },
      { name: "twitter:title", content: "แผนแก้ไข CAPA / CQI — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "บันทึกการวิเคราะห์สาเหตุและติดตามการแก้ไขปรับปรุงตามวงจร PDCA ตามข้อกำหนด ISO 15189 ข้อ 8.7 และ 8.8" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/capa" }],
  }),
component: CapaPage,
});

type CAPA = {
  id: string; indicator_id: string; fiscal_year: number; period_month: number | null;
  problem_description: string; root_cause: string | null; action_plan: string;
  responsible_person: string | null; due_date: string | null; status: string;
  result_description: string | null;
  severity: string | null; priority: string | null; nc_source: string | null;
  nc_detected_date: string | null; rca_method: string | null; rca_data: unknown;
  containment_action: string | null; pdca_phase: string | null; approval_status: string | null;
  approved_by: string | null; approved_at: string | null; rejection_reason: string | null;
  verification_before: number | null; verification_1m: number | null; verification_3m: number | null;
  effectiveness: string | null; closed_at: string | null;
};
type Indicator = { id: string; code: string; name_th: string; department_id: string | null; target_value: number | null; is_leaf: boolean; is_inverted: boolean; target_condition: string | null };
type Dept = { id: string; name_th: string };
type Measurement = { indicator_id: string; fiscal_year: number; period_month: number; calculated_value: number | null };

function CapaPage() {
  const { fiscalYear } = useFiscalYear();
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "manager", "staff"]);
  const [tab, setTab] = useState("nc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["capa", fiscalYear],
    queryFn: async () => {
      const [{ data: capa }, { data: inds }, { data: depts }, { data: meas }] = await Promise.all([
        supabase.from("corrective_actions").select("*").eq("fiscal_year", fiscalYear).order("created_at", { ascending: false }),
        supabase.from("indicators").select("id, code, name_th, department_id, target_value, is_leaf, is_inverted, target_condition, sort_order").order("sort_order").order("code"),
        supabase.from("departments").select("id, name_th").order("name_th"),
        fetchAll<{ indicator_id: string; fiscal_year: number; period_month: number | null; calculated_value: number | null }>((f, t) => supabase.from("measurements").select("indicator_id, fiscal_year, period_month, calculated_value").eq("fiscal_year", fiscalYear).range(f, t)).then((d) => ({ data: d })),
      ]);
      const { sortIndicators } = await import("@/lib/indicator-sort");
      registerIndicatorDecimals((inds ?? []) as Indicator[]);
      return {
        capa: (capa ?? []) as CAPA[],
        inds: sortIndicators((inds ?? []) as Indicator[]),
        depts: (depts ?? []) as Dept[],
        meas: (meas ?? []) as Measurement[],
      };
    },
  });

  const indMap = useMemo(() => new Map((data?.inds ?? []).map((i) => [i.id, i])), [data?.inds]);
  const openCapa = data?.capa.find((c) => c.id === openId) ?? null;

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">CAPA / CQI — ระบบ PDCA</h2>
          <p className="text-sm text-muted-foreground">ปีงบประมาณ {fiscalYear} · ISO 15189 §8.7-8.8</p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" />บันทึก NC ด้วยตนเอง</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full overflow-x-auto justify-start md:grid md:grid-cols-5">
          <TabsTrigger value="nc" className="shrink-0">📋 A. Nonconformity Log</TabsTrigger>
          <TabsTrigger value="rca" className="shrink-0">🔍 B. RCA & Plan</TabsTrigger>
          <TabsTrigger value="kanban" className="shrink-0">📊 C. Tracking</TabsTrigger>
          <TabsTrigger value="verify" className="shrink-0">✅ D. Verification</TabsTrigger>
          <TabsTrigger value="kb" className="shrink-0">📁 E. Knowledge Base</TabsTrigger>

        </TabsList>

        <TabsContent value="nc" className="mt-4">
          <NcLogTab capa={data!.capa} inds={data!.inds} depts={data!.depts} meas={data!.meas} onOpen={setOpenId} fiscalYear={fiscalYear} />
        </TabsContent>
        <TabsContent value="rca" className="mt-4">
          <RcaListTab capa={data!.capa} indMap={indMap} onOpen={setOpenId} />
        </TabsContent>
        <TabsContent value="kanban" className="mt-4">
          <KanbanTab
            rows={data!.capa}
            indMap={new Map(data!.inds.map((i) => [i.id, { code: i.code, name_th: i.name_th }]))}
            onOpen={setOpenId}
          />
        </TabsContent>
        <TabsContent value="verify" className="mt-4">
          <VerificationTab capa={data!.capa} inds={data!.inds} meas={data!.meas} onOpen={setOpenId} />
        </TabsContent>
        <TabsContent value="kb" className="mt-4">
          <KnowledgeTab inds={data!.inds} />
        </TabsContent>
      </Tabs>

      {openCapa && (
        <RcaDialog capa={openCapa} indicator={indMap.get(openCapa.indicator_id)} onClose={() => setOpenId(null)} />
      )}

      {createOpen && (
        <CreateNcDialog indicators={data!.inds} fiscalYear={fiscalYear} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

// =========== TAB A: NC LOG ===========
function NcLogTab({ capa, inds, depts, meas, onOpen, fiscalYear }: {
  capa: CAPA[]; inds: Indicator[]; depts: Dept[]; meas: Measurement[]; onOpen: (id: string) => void; fiscalYear: number;
}) {
  const [sevFilter, setSevFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const indMap = new Map(inds.map((i) => [i.id, i]));

  const filtered = capa.filter((c) => {
    if (sevFilter !== "all" && c.severity !== sevFilter) return false;
    if (monthFilter !== "all" && String(c.period_month ?? "") !== monthFilter) return false;
    if (sourceFilter !== "all" && c.nc_source !== sourceFilter) return false;
    if (deptFilter !== "all") {
      const ind = indMap.get(c.indicator_id);
      if (ind?.department_id !== deptFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={sevFilter} onValueChange={setSevFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="ความรุนแรง" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกระดับ</SelectItem>
            {Object.entries(SEVERITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="ที่มา" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกที่มา</SelectItem>
            {Object.entries(NC_SOURCE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="เดือน" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกเดือน</SelectItem>
            {FISCAL_MONTH_TO_CAL.map((m, i) => <SelectItem key={m} value={String(m)}>{THAI_MONTHS[i]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="สาขา" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสาขา</SelectItem>
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ตัวชี้วัด</TableHead>
              <TableHead>ที่มา</TableHead>
              <TableHead>ค่า/เป้า</TableHead>
              <TableHead>ความรุนแรง</TableHead>
              <TableHead>เดือน</TableHead>
              <TableHead>PDCA</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">ไม่พบรายการ — ระบบจะสร้างอัตโนมัติเมื่อบันทึกค่าตัวชี้วัดที่ต่ำกว่าเป้า</TableCell></TableRow>}
            {filtered.map((c) => {
              const ind = indMap.get(c.indicator_id);
              const val = meas.find((m) => m.indicator_id === c.indicator_id && m.period_month === c.period_month && m.fiscal_year === fiscalYear)?.calculated_value;
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onOpen(c.id)}>
                  <TableCell>
                    <div className="text-sm font-medium">{ind?.name_th ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{ind?.code}</div>
                  </TableCell>
                  <TableCell className="text-xs">{NC_SOURCE_LABEL[c.nc_source as keyof typeof NC_SOURCE_LABEL] ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {formatIndicatorValue(ind?.code, val != null ? Number(val) : null)} / {ind?.target_value?.toFixed(decimalsFor(ind?.code)) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.severity && <Badge className={SEVERITY_TONE[c.severity as keyof typeof SEVERITY_TONE]}>{SEVERITY_LABEL[c.severity as keyof typeof SEVERITY_LABEL]}</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{c.period_month ? THAI_MONTHS[FISCAL_MONTH_TO_CAL.indexOf(c.period_month)] : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{PDCA_LABEL[c.pdca_phase as keyof typeof PDCA_LABEL] ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{APPROVAL_LABEL[c.approval_status as keyof typeof APPROVAL_LABEL] ?? "—"}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="ghost">เปิด RCA</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// =========== TAB B: RCA LIST ===========
function RcaListTab({ capa, indMap, onOpen }: {
  capa: CAPA[]; indMap: Map<string, Indicator>; onOpen: (id: string) => void;
}) {
  const list = capa.filter((c) => c.pdca_phase === "plan" || c.approval_status === "draft" || c.approval_status === "rejected");
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>ตัวชี้วัด</TableHead><TableHead>ปัญหา</TableHead>
          <TableHead>วิธี RCA</TableHead><TableHead>สาเหตุ</TableHead>
          <TableHead>สถานะ</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">ไม่มีรายการรอวิเคราะห์</TableCell></TableRow>}
          {list.map((c) => {
            const ind = indMap.get(c.indicator_id);
            return (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onOpen(c.id)}>
                <TableCell><div className="text-sm font-medium">{ind?.name_th}</div><div className="text-xs font-mono text-muted-foreground">{ind?.code}</div></TableCell>
                <TableCell className="max-w-[240px] truncate text-sm">{c.problem_description}</TableCell>
                <TableCell className="text-xs">{c.rca_method ?? "—"}</TableCell>
                <TableCell className="max-w-[240px] truncate text-xs">{c.root_cause ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{APPROVAL_LABEL[c.approval_status as keyof typeof APPROVAL_LABEL] ?? "—"}</Badge></TableCell>
                <TableCell><Button size="sm">วิเคราะห์</Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

// =========== TAB D: VERIFICATION ===========
function VerificationTab({ capa, inds, meas, onOpen }: {
  capa: CAPA[]; inds: Indicator[]; meas: Measurement[]; onOpen: (id: string) => void;
}) {
  const qc = useQueryClient();
  const indMap = new Map(inds.map((i) => [i.id, i]));
  const list = capa.filter((c) => c.approval_status === "approved" || c.pdca_phase === "check" || c.pdca_phase === "act");

  const getMeasFor = (indId: string, pm: number | null, offset: number): number | null => {
    if (!pm) return null;
    const idx = FISCAL_MONTH_TO_CAL.indexOf(pm);
    const targetIdx = idx + offset;
    if (targetIdx < 0 || targetIdx >= 12) return null;
    const targetPm = FISCAL_MONTH_TO_CAL[targetIdx];
    const m = meas.find((x) => x.indicator_id === indId && x.period_month === targetPm);
    return m?.calculated_value ?? null;
  };

  const setEff = useMutation({
    mutationFn: async ({ id, eff }: { id: string; eff: string }) => {
      const patch: Record<string, unknown> = { effectiveness: eff };
      if (eff === "effective") { patch.pdca_phase = "act"; patch.status = "closed"; patch.closed_at = new Date().toISOString(); }
      const { error } = await supabase.from("corrective_actions").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("บันทึกผลแล้ว"); qc.invalidateQueries({ queryKey: ["capa"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>ตัวชี้วัด</TableHead><TableHead>เป้า</TableHead>
          <TableHead>ก่อน</TableHead><TableHead>หลัง 1 เดือน</TableHead><TableHead>หลัง 3 เดือน</TableHead>
          <TableHead>ประสิทธิผล</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">ยังไม่มีแผนที่อนุมัติแล้ว</TableCell></TableRow>}
          {list.map((c) => {
            const ind = indMap.get(c.indicator_id);
            const before = c.verification_before ?? getMeasFor(c.indicator_id, c.period_month, 0);
            const m1 = c.verification_1m ?? getMeasFor(c.indicator_id, c.period_month, 1);
            const m3 = c.verification_3m ?? getMeasFor(c.indicator_id, c.period_month, 3);
            return (
              <TableRow key={c.id}>
                <TableCell className="cursor-pointer" onClick={() => onOpen(c.id)}>
                  <div className="text-sm font-medium">{ind?.name_th}</div>
                  <div className="text-xs font-mono text-muted-foreground">{ind?.code}</div>
                </TableCell>
                <TableCell className="text-xs">{ind?.target_value?.toFixed(decimalsFor(ind?.code)) ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{formatIndicatorValue(ind?.code, before != null ? Number(before) : null)}</TableCell>
                <TableCell className="font-mono text-sm">{formatIndicatorValue(ind?.code, m1 != null ? Number(m1) : null)}</TableCell>
                <TableCell className="font-mono text-sm">{formatIndicatorValue(ind?.code, m3 != null ? Number(m3) : null)}</TableCell>
                <TableCell>
                  <Select value={c.effectiveness ?? ""} onValueChange={(v) => setEff.mutate({ id: c.id, eff: v })}>
                    <SelectTrigger className="w-[140px] h-8"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EFFECTIVENESS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => onOpen(c.id)}>รายละเอียด</Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

// =========== TAB E: KNOWLEDGE BASE ===========
function KnowledgeTab({ inds }: { inds: Indicator[] }) {
  const qc = useQueryClient();
  const { hasAnyRole, user } = useAuth();
  const canEdit = hasAnyRole(["admin", "manager"]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["capa-docs"],
    queryFn: async () => {
      const { data } = await supabase.from("capa_documents").select("*").order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = docs.filter((d) => {
    if (search && !`${d.title} ${d.doc_code ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (tagFilter && !(d.tags ?? []).includes(tagFilter)) return false;
    return true;
  });

  const allTags = Array.from(new Set(docs.flatMap((d) => d.tags ?? [])));

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("capa-docs").createSignedUrl(path, 3600);
    if (error || !data) { toast.error(error?.message ?? "ดาวน์โหลดไม่สำเร็จ"); return; }
    const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click();
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const d = docs.find((x) => x.id === id);
      if (d?.storage_path) await supabase.storage.from("capa-docs").remove([d.storage_path]);
      const { error } = await supabase.from("capa_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("ลบแล้ว"); qc.invalidateQueries({ queryKey: ["capa-docs"] }); },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="ค้นหาเอกสาร..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-64" />
        </div>
        <Select value={tagFilter || "all"} onValueChange={(v) => setTagFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุก tag</SelectItem>
            {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canEdit && <Button onClick={() => setUploadOpen(true)}><Plus className="w-4 h-4 mr-2" />อัปโหลดเอกสาร</Button>}
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>ชื่อเอกสาร</TableHead><TableHead>รหัส</TableHead><TableHead>Tags</TableHead>
            <TableHead>Version</TableHead><TableHead>อัปเดต</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">ยังไม่มีเอกสาร</TableCell></TableRow>}
            {filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell className="text-xs font-mono">{d.doc_code ?? "—"}</TableCell>
                <TableCell><div className="flex gap-1 flex-wrap">{(d.tags ?? []).map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div></TableCell>
                <TableCell className="text-xs">{d.version ?? "—"}</TableCell>
                <TableCell className="text-xs">{new Date(d.updated_at).toLocaleDateString("th-TH")}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {d.storage_path && <Button size="icon" variant="ghost" onClick={() => download(d.storage_path!, d.title)}><Download className="w-4 h-4" /></Button>}
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => del.mutate(d.id)}><Trash2 className="w-4 h-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {uploadOpen && <UploadDocDialog inds={inds} userId={user?.id} onClose={() => setUploadOpen(false)} />}
    </div>
  );
}

function UploadDocDialog({ inds, userId, onClose }: { inds: Indicator[]; userId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [version, setVersion] = useState("1.0");
  const [tags, setTags] = useState("");
  const [relInd, setRelInd] = useState<string>("none");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast.error("กรุณากรอกชื่อเอกสาร"); return; }
    setBusy(true);
    try {
      let path: string | null = null;
      if (file) {
        path = `kb/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("capa-docs").upload(path, file);
        if (error) throw error;
      }
      const { error: insErr } = await supabase.from("capa_documents").insert({
        title, doc_code: code || null, version: version || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        related_indicator_id: relInd === "none" ? null : relInd,
        storage_path: path, uploaded_by: userId,
      });
      if (insErr) throw insErr;
      toast.success("อัปโหลดเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["capa-docs"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>อัปโหลดเอกสารคลังความรู้</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">ชื่อเอกสาร *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">รหัสเอกสาร</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WI-LAB-001" /></div>
            <div><Label className="text-xs">Version</Label><Input value={version} onChange={(e) => setVersion(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Tags (คั่นด้วย comma)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="IQC, TAT, Safety" /></div>
          <div>
            <Label className="text-xs">ตัวชี้วัดที่เกี่ยวข้อง</Label>
            <Select value={relInd} onValueChange={setRelInd}>
              <SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                {inds.filter((i) => i.is_leaf).map((i) => <SelectItem key={i.id} value={i.id}>{i.code} {i.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">ไฟล์</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}อัปโหลด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== CREATE NC (manual) ===========
function CreateNcDialog({ indicators, fiscalYear, onClose }: {
  indicators: Indicator[]; fiscalYear: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [indId, setIndId] = useState<string>("");
  const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [source, setSource] = useState<string>("manual");
  const [problem, setProblem] = useState("");
  const [severity, setSeverity] = useState<string>("medium");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!indId || !problem.trim()) { toast.error("กรุณาเลือกตัวชี้วัดและกรอกปัญหา"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("corrective_actions").insert({
        indicator_id: indId, fiscal_year: fiscalYear, period_month: parseInt(month),
        problem_description: problem, action_plan: "(รอกำหนดแผนแก้ไข)",
        nc_source: source, nc_detected_date: new Date().toISOString().slice(0, 10),
        nc_detected_by: user?.id, severity, approval_status: "draft", pdca_phase: "plan",
      });
      if (error) throw error;
      toast.success("บันทึก NC แล้ว");
      qc.invalidateQueries({ queryKey: ["capa"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>บันทึก Nonconformity ด้วยตนเอง</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">ตัวชี้วัด *</Label>
            <Select value={indId} onValueChange={setIndId}>
              <SelectTrigger><SelectValue placeholder="เลือก..." /></SelectTrigger>
              <SelectContent>
                {indicators.filter((i) => i.is_leaf).map((i) => <SelectItem key={i.id} value={i.id}>{i.code} {i.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">เดือน</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FISCAL_MONTH_TO_CAL.map((m, i) => <SelectItem key={m} value={String(m)}>{THAI_MONTHS[i]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ที่มา</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(NC_SOURCE_LABEL).filter(([k]) => k !== "kpi_below_target").map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ความรุนแรง</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SEVERITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">คำอธิบายปัญหา *</Label><Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keepImports = calcSeverity;
