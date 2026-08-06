import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({
    meta: [
      { title: "ทบทวนเป้าหมายประจำปี — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "ทบทวนและปรับปรุงค่าเป้าหมายของตัวชี้วัดแต่ละรายการในแต่ละปีงบประมาณ พร้อมประวัติการเปลี่ยนแปลงเป้าหมาย" },
      { property: "og:title", content: "ทบทวนเป้าหมายประจำปี — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "ทบทวนและปรับปรุงค่าเป้าหมายของตัวชี้วัดแต่ละรายการในแต่ละปีงบประมาณ พร้อมประวัติการเปลี่ยนแปลงเป้าหมาย" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/targets" },
      { name: "twitter:title", content: "ทบทวนเป้าหมายประจำปี — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "ทบทวนและปรับปรุงค่าเป้าหมายของตัวชี้วัดแต่ละรายการในแต่ละปีงบประมาณ พร้อมประวัติการเปลี่ยนแปลงเป้าหมาย" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/targets" }],
  }),
  component: TargetsPage,
});

type Ind = { id: string; code: string; name_th: string; level: string; target_value: number | null; target_condition: string | null; unit: string | null };
type History = { id: string; indicator_id: string; fiscal_year: number; old_target: number | null; new_target: number; reason: string | null; changed_at: string; changed_by: string | null };

function TargetsPage() {
  const { fiscalYear } = useFiscalYear();
  const { hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["admin", "manager"]);
  const [editing, setEditing] = useState<Ind | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["targets", fiscalYear],
    queryFn: async () => {
      const [{ data: inds }, { data: hist }, { data: profiles }] = await Promise.all([
        supabase.from("indicators").select("id, code, name_th, level, target_value, target_condition, unit, sort_order, parent_id").eq("is_active", true).order("sort_order").order("code"),
        supabase.from("target_history").select("*").order("changed_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
      ]);
      const { sortIndicators } = await import("@/lib/indicator-sort");
      return { inds: sortIndicators((inds ?? []) as Ind[]), hist: (hist ?? []) as History[], profiles: profiles ?? [] };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.inds.filter((i) => !q || i.code.toLowerCase().includes(q) || i.name_th.toLowerCase().includes(q));
  }, [data, search]);

  if (!allowed) return <Card><CardContent className="py-10 text-center text-muted-foreground">เฉพาะผู้ดูแล/ผู้จัดการเท่านั้น</CardContent></Card>;
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  const indMap = new Map(data!.inds.map((i) => [i.id, i]));
  const userName = (uid: string | null) => uid ? data!.profiles.find((p) => p.id === uid)?.full_name ?? "—" : "—";

  return (
    <Tabs defaultValue="list" className="space-y-4">
      <TabsList>
        <TabsTrigger value="list">เป้าหมายปัจจุบัน</TabsTrigger>
        <TabsTrigger value="history">ประวัติการปรับเป้าหมาย</TabsTrigger>
      </TabsList>

      <TabsContent value="list" className="space-y-3">
        <div className="flex items-center gap-2">
          <Input placeholder="ค้นหาตัวชี้วัด..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <span className="text-xs text-muted-foreground">ปีงบประมาณ {fiscalYear}</span>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>รหัส</TableHead><TableHead>ชื่อตัวชี้วัด</TableHead><TableHead>ระดับ</TableHead>
                <TableHead className="text-right">เป้าหมายปัจจุบัน</TableHead><TableHead>เงื่อนไข</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.code}</TableCell>
                    <TableCell className="text-sm">{i.name_th}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.level}</TableCell>
                    <TableCell className="text-right">{i.target_value ?? "—"} {i.unit ?? ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{condLabel(i.target_condition)}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => setEditing(i)}><Pencil className="w-3.5 h-3.5 mr-1" />ปรับ</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>วันที่</TableHead><TableHead>ตัวชี้วัด</TableHead><TableHead>ปี</TableHead>
                <TableHead className="text-right">เป้าเดิม</TableHead><TableHead className="text-right">เป้าใหม่</TableHead>
                <TableHead>เหตุผล</TableHead><TableHead>โดย</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data!.hist.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">ยังไม่มีประวัติ</TableCell></TableRow>}
                {data!.hist.map((h) => {
                  const i = indMap.get(h.indicator_id);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{new Date(h.changed_at).toLocaleString("th-TH")}</TableCell>
                      <TableCell className="text-sm">{i?.name_th ?? "—"} <span className="font-mono text-[10px] text-muted-foreground">{i?.code}</span></TableCell>
                      <TableCell className="text-xs">{h.fiscal_year}</TableCell>
                      <TableCell className="text-right text-sm">{h.old_target ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{h.new_target}</TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{h.reason ?? "—"}</TableCell>
                      <TableCell className="text-xs">{userName(h.changed_by)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {editing && <EditTargetDialog ind={editing} fiscalYear={fiscalYear} onClose={() => setEditing(null)} />}
    </Tabs>
  );
}

function condLabel(c: string | null) { return c === "lte" ? "≤" : c === "eq" ? "=" : "≥"; }

function EditTargetDialog({ ind, fiscalYear, onClose }: { ind: Ind; fiscalYear: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [value, setValue] = useState(String(ind.target_value ?? ""));
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const newTarget = parseFloat(value);
      if (isNaN(newTarget)) throw new Error("ค่าเป้าหมายไม่ถูกต้อง");
      const { error: e1 } = await supabase.from("target_history").insert({
        indicator_id: ind.id, fiscal_year: fiscalYear, old_target: ind.target_value, new_target: newTarget, reason: reason || null, changed_by: user?.id ?? null,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("indicators").update({ target_value: newTarget }).eq("id", ind.id);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("ปรับเป้าหมายแล้ว"); qc.invalidateQueries({ queryKey: ["targets"] }); onClose(); },
    onError: (e) => toast.error("ผิดพลาด: " + e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>ปรับเป้าหมาย</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">ตัวชี้วัด</Label>
            <div className="text-sm font-medium">{ind.name_th}</div>
            <div className="text-xs text-muted-foreground font-mono">{ind.code}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ค่าเป้าหมายใหม่ ({ind.unit ?? "%"})</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
            <div className="text-[10px] text-muted-foreground">เป้าหมายเดิม: {ind.target_value ?? "—"}</div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">เหตุผลในการปรับ</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !value}>{save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
