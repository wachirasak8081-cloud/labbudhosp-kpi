import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerIndicatorDecimals, formatTargetValue } from "@/lib/indicator-format";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Plus, Pencil, Trash2, Loader2, ExternalLink, Upload, Download, Power } from "lucide-react";
import { toast } from "sonner";
import { exportIndicators } from "@/lib/indicators-xlsx";

export const Route = createFileRoute("/_authenticated/indicators/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "จัดการตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "จัดการโครงสร้างตัวชี้วัดแบบลำดับชั้น Objective, KPI, QI และ Sub-QI พร้อมสูตรคำนวณและเป้าหมายประจำปี" },
      { property: "og:title", content: "จัดการตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "จัดการโครงสร้างตัวชี้วัดแบบลำดับชั้น Objective, KPI, QI และ Sub-QI พร้อมสูตรคำนวณและเป้าหมายประจำปี" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/indicators" },
      { name: "twitter:title", content: "จัดการตัวชี้วัด — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "จัดการโครงสร้างตัวชี้วัดแบบลำดับชั้น Objective, KPI, QI และ Sub-QI พร้อมสูตรคำนวณและเป้าหมายประจำปี" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/indicators" }],
  }),
  component: IndicatorsPage,
});

type Indicator = {
  id: string; code: string; name_th: string; level: "object" | "kpi" | "qi" | "subqi";
  parent_id: string | null; formula_description: string | null; formula_link: string | null;
  numerator_description: string | null; denominator_description: string | null;
  target_value: number | null; target_condition: string | null; unit: string | null;
  frequency: string | null; is_leaf: boolean; is_inverted: boolean;
  department_id: string | null; sort_order: number; is_active: boolean;
};

function IndicatorsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["indicators-all"],
    queryFn: async () => {
      const [{ data: inds }, { data: depts }] = await Promise.all([
        supabase.from("indicators").select("*").order("sort_order").order("code"),
        supabase.from("departments").select("id, name_th, code"),
      ]);
      const { sortIndicators } = await import("@/lib/indicator-sort");
      const sorted = sortIndicators((inds ?? []) as Indicator[]);
      registerIndicatorDecimals(sorted);
      return { inds: sorted, depts: depts ?? [] };
    },
  });

  const tree = useMemo(() => buildTree(data?.inds ?? []), [data]);
  const deptMap = useMemo(() => new Map((data?.depts ?? []).map((d) => [d.id, d.name_th])), [data]);
  const deptCodeMap = useMemo(() => new Map((data?.depts ?? []).map((d) => [d.id, (d as { code?: string }).code ?? null])), [data]);
  const codeMap = useMemo(() => new Map((data?.inds ?? []).map((i) => [i.id, i.code])), [data]);

  const [editing, setEditing] = useState<Indicator | null>(null);
  const [creating, setCreating] = useState(false);
  const [parentFor, setParentFor] = useState<Indicator | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("indicators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("ลบตัวชี้วัดแล้ว"); qc.invalidateQueries({ queryKey: ["indicators-all"] }); },
    onError: (e) => toast.error("ลบไม่สำเร็จ: " + e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (i: Indicator) => {
      const { error } = await supabase.from("indicators").update({ is_active: !i.is_active }).eq("id", i.id);
      if (error) throw error;
    },
    onSuccess: (_d, i) => { toast.success(i.is_active ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว"); qc.invalidateQueries({ queryKey: ["indicators-all"] }); },
    onError: (e) => toast.error("ไม่สำเร็จ: " + e.message),
  });

  const handleExport = () => {
    const items = (data?.inds ?? []).map((i) => ({
      level: i.level,
      parent_code: i.parent_id ? codeMap.get(i.parent_id) ?? null : null,
      code: i.code, name_th: i.name_th,
      formula_description: i.formula_description, formula_link: i.formula_link,
      numerator_description: i.numerator_description, denominator_description: i.denominator_description,
      target_value: i.target_value, target_condition: i.target_condition,
      unit: i.unit, frequency: i.frequency,
      is_leaf: i.is_leaf, is_inverted: i.is_inverted,
      department_code: i.department_id ? deptCodeMap.get(i.department_id) ?? null : null,
      sort_order: i.sort_order,
    }));
    exportIndicators(items);
    toast.success(`ส่งออก ${items.length} รายการแล้ว`);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">โครงสร้างตัวชี้วัดแบบลำดับชั้น (Objective → KPI → QI → Sub-QI)</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />ส่งออก Excel
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/indicators/import"><Upload className="w-4 h-4 mr-2" />นำเข้า Excel</Link>
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => { setEditing(null); setParentFor(null); setCreating(true); }}>
              <Plus className="w-4 h-4 mr-2" />เพิ่มตัวชี้วัด
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          {tree.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">ยังไม่มีตัวชี้วัด — เริ่มเพิ่มข้อมูลได้ที่ปุ่ม "เพิ่มตัวชี้วัด"</p>
          ) : (
            <div className="space-y-1">
              {tree.map((n) => (
                <IndicatorNode key={n.ind.id} node={n} deptMap={deptMap} canEdit={canEdit}
                  onEdit={(i) => { setEditing(i); setCreating(false); }}
                  onAddChild={(i) => { setParentFor(i); setEditing(null); setCreating(true); }}
                  onDelete={(i) => { if (confirm(`ลบ "${i.name_th}" ?`)) deleteMut.mutate(i.id); }}
                  onToggle={(i) => toggleMut.mutate(i)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <IndicatorDialog
          open
          onClose={() => { setEditing(null); setCreating(false); setParentFor(null); }}
          indicator={editing}
          parent={parentFor}
          departments={data?.depts ?? []}
        />
      )}
    </div>
  );
}

type Node = { ind: Indicator; children: Node[] };
function buildTree(items: Indicator[]): Node[] {
  const map = new Map<string, Node>();
  items.forEach((i) => map.set(i.id, { ind: i, children: [] }));
  const roots: Node[] = [];
  items.forEach((i) => {
    const n = map.get(i.id)!;
    if (i.parent_id && map.has(i.parent_id)) map.get(i.parent_id)!.children.push(n);
    else roots.push(n);
  });
  return roots;
}

const LEVEL_LABEL = { object: "Objective", kpi: "KPI", qi: "QI", subqi: "Sub-QI" } as const;
const LEVEL_COLOR = { object: "bg-primary text-primary-foreground", kpi: "bg-success text-success-foreground", qi: "bg-accent text-accent-foreground", subqi: "bg-secondary text-secondary-foreground" } as const;

function IndicatorNode({ node, deptMap, canEdit, onEdit, onAddChild, onDelete, onToggle, depth = 0 }: {
  node: Node; deptMap: Map<string, string>; canEdit: boolean;
  onEdit: (i: Indicator) => void; onAddChild: (i: Indicator) => void;
  onDelete: (i: Indicator) => void; onToggle: (i: Indicator) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);
  const i = node.ind;
  const hasKids = node.children.length > 0;
  const freqLabel = i.frequency === "yearly" ? "รายปี" : i.frequency === "monthly" ? "รายเดือน" : null;

  return (
    <div>
      <div className={`flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted/60 group ${i.is_active ? "" : "opacity-60"}`} style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <button onClick={() => setOpen((v) => !v)} className="w-5 h-5 flex items-center justify-center text-muted-foreground" disabled={!hasKids}>
          {hasKids && <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />}
        </button>
        <Badge className={LEVEL_COLOR[i.level] + " text-xs shrink-0"}>{LEVEL_LABEL[i.level]}</Badge>
        <span className="text-xs font-mono text-muted-foreground shrink-0">{i.code}</span>
        <span className="font-medium text-sm flex-1 truncate">{i.name_th}</span>
        {i.target_value != null && (
          <Badge variant="outline" className="text-xs shrink-0">
            เป้า {targetSymbol(i.target_condition)} {formatTargetValue(i.code, i.target_value)}{i.unit ?? ""}
          </Badge>
        )}
        {freqLabel && <span className="text-[11px] text-muted-foreground hidden lg:inline shrink-0">{freqLabel}</span>}
        {i.department_id && <span className="text-xs text-muted-foreground hidden md:inline truncate max-w-[120px]">{deptMap.get(i.department_id)}</span>}
        <Badge variant={i.is_active ? "secondary" : "outline"} className="text-[10px] shrink-0">
          {i.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
        </Badge>
        {i.formula_link && <a href={i.formula_link} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="w-3.5 h-3.5" /></a>}
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            {i.level !== "subqi" && <Button size="icon" variant="ghost" onClick={() => onAddChild(i)} title="เพิ่มลูก"><Plus className="w-4 h-4" /></Button>}
            <Button size="icon" variant="ghost" onClick={() => onEdit(i)} title="แก้ไข"><Pencil className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => onToggle(i)} title={i.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}><Power className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => onDelete(i)} className="text-destructive" title="ลบ"><Trash2 className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
      {open && hasKids && node.children.map((c) => (
        <IndicatorNode key={c.ind.id} node={c} deptMap={deptMap} canEdit={canEdit}
          onEdit={onEdit} onAddChild={onAddChild} onDelete={onDelete} onToggle={onToggle} depth={depth + 1} />
      ))}
    </div>
  );
}

function targetSymbol(c: string | null) { return c === "lte" ? "≤" : c === "eq" ? "=" : "≥"; }

function nextLevel(parent: Indicator | null): Indicator["level"] {
  if (!parent) return "object";
  return parent.level === "object" ? "kpi" : parent.level === "kpi" ? "qi" : "subqi";
}

function IndicatorDialog({ open, onClose, indicator, parent, departments }: {
  open: boolean; onClose: () => void; indicator: Indicator | null; parent: Indicator | null;
  departments: { id: string; name_th: string }[];
}) {
  const qc = useQueryClient();
  const initial = indicator ?? {
    id: "", code: "", name_th: "", level: nextLevel(parent),
    parent_id: parent?.id ?? null, formula_description: "", formula_link: "",
    numerator_description: "", denominator_description: "",
    target_value: null, target_condition: "gte", unit: "%",
    frequency: "monthly", is_leaf: true, is_inverted: false,
    department_id: parent?.department_id ?? null, sort_order: 0, is_active: true,
  } as Indicator;
  const [form, setForm] = useState<Indicator>(initial);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code, name_th: form.name_th, level: form.level, parent_id: form.parent_id,
        formula_description: form.formula_description || null, formula_link: form.formula_link || null,
        numerator_description: form.numerator_description || null, denominator_description: form.denominator_description || null,
        target_value: form.target_value, target_condition: form.target_condition,
        unit: form.unit || "%", frequency: form.frequency, is_leaf: form.is_leaf,
        is_inverted: form.is_inverted, department_id: form.department_id, sort_order: form.sort_order,
        is_active: form.is_active,
      };
      if (indicator) {
        const { error } = await supabase.from("indicators").update(payload).eq("id", indicator.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("indicators").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(indicator ? "บันทึกการแก้ไขแล้ว" : "เพิ่มตัวชี้วัดแล้ว");
      qc.invalidateQueries({ queryKey: ["indicators-all"] });
      onClose();
    },
    onError: (e) => toast.error("บันทึกไม่สำเร็จ: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{indicator ? "แก้ไขตัวชี้วัด" : "เพิ่มตัวชี้วัด"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="รหัส"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="ระดับ">
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as Indicator["level"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="object">Objective</SelectItem>
                <SelectItem value="kpi">KPI</SelectItem>
                <SelectItem value="qi">QI</SelectItem>
                <SelectItem value="subqi">Sub-QI</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="ชื่อตัวชี้วัด" className="sm:col-span-2">
            <Input value={form.name_th} onChange={(e) => setForm({ ...form, name_th: e.target.value })} />
          </Field>
          <Field label="สาขางาน">
            <Select value={form.department_id ?? "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="ความถี่">
            <Select value={form.frequency ?? "monthly"} onValueChange={(v) => setForm({ ...form, frequency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">รายเดือน</SelectItem>
                <SelectItem value="yearly">รายปี</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="ค่าเป้าหมาย">
            <Input type="number" step="0.0001" value={form.target_value ?? ""} onChange={(e) => setForm({ ...form, target_value: e.target.value === "" ? null : parseFloat(e.target.value) })} />
          </Field>
          <Field label="เงื่อนไขเป้า">
            <Select value={form.target_condition ?? "gte"} onValueChange={(v) => setForm({ ...form, target_condition: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gte">≥ มากกว่าหรือเท่ากับ</SelectItem>
                <SelectItem value="lte">≤ น้อยกว่าหรือเท่ากับ</SelectItem>
                <SelectItem value="eq">= เท่ากับ</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="หน่วย"><Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="ลำดับ"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || "0", 10) })} /></Field>
          <Field label="คำอธิบายสูตรคำนวณ" className="sm:col-span-2">
            <Textarea rows={2} value={form.formula_description ?? ""} onChange={(e) => setForm({ ...form, formula_description: e.target.value })} />
          </Field>
          <Field label="ลิงก์วิธีปฏิบัติ" className="sm:col-span-2">
            <Input placeholder="https://..." value={form.formula_link ?? ""} onChange={(e) => setForm({ ...form, formula_link: e.target.value })} />
          </Field>
          <Field label="ตัวตั้ง (Numerator)"><Textarea rows={2} value={form.numerator_description ?? ""} onChange={(e) => setForm({ ...form, numerator_description: e.target.value })} /></Field>
          <Field label="ตัวหาร (Denominator)"><Textarea rows={2} value={form.denominator_description ?? ""} onChange={(e) => setForm({ ...form, denominator_description: e.target.value })} /></Field>
          <Field label="ประเภท" className="sm:col-span-2">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_leaf} onChange={(e) => setForm({ ...form, is_leaf: e.target.checked })} />
                ใบ (กรอกข้อมูลตรง)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_inverted} onChange={(e) => setForm({ ...form, is_inverted: e.target.checked })} />
                ยิ่งน้อยยิ่งดี (เช่น near miss)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                ใช้งาน
              </label>
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.code || !form.name_th}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1 " + className}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
