import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/capa")({
  component: CapaPage,
});

type CAPA = {
  id: string; indicator_id: string; fiscal_year: number; period_month: number | null;
  problem_description: string; root_cause: string | null; action_plan: string;
  responsible_person: string | null; due_date: string | null; status: "open" | "in_progress" | "closed";
  result_description: string | null;
};

function CapaPage() {
  const { fiscalYear } = useFiscalYear();
  const { hasAnyRole } = useAuth();
  const canEdit = hasAnyRole(["admin", "manager"]);
  const [editing, setEditing] = useState<CAPA | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["capa", fiscalYear],
    queryFn: async () => {
      const [{ data: capa }, { data: inds }] = await Promise.all([
        supabase.from("corrective_actions").select("*").eq("fiscal_year", fiscalYear).order("created_at", { ascending: false }),
        supabase.from("indicators").select("id, code, name_th"),
      ]);
      return { capa: (capa ?? []) as CAPA[], inds: inds ?? [] };
    },
  });
  const indMap = new Map((data?.inds ?? []).map((i) => [i.id, i]));

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">แผนแก้ไขเชิงป้องกันและการพัฒนาคุณภาพต่อเนื่อง (CAPA / CQI) ปีงบประมาณ {fiscalYear}</p>
        {canEdit && <Button onClick={() => { setEditing(null); setCreating(true); }}><Plus className="w-4 h-4 mr-2" />เพิ่มแผน</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ตัวชี้วัด</TableHead>
                <TableHead>ปัญหา</TableHead>
                <TableHead>แผนแก้ไข</TableHead>
                <TableHead>ผู้รับผิดชอบ</TableHead>
                <TableHead>กำหนด</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.capa.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">ยังไม่มีแผนแก้ไข</TableCell></TableRow>}
              {data!.capa.map((c) => {
                const ind = indMap.get(c.indicator_id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{ind?.name_th ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{ind?.code}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{c.problem_description}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{c.action_plan}</TableCell>
                    <TableCell className="text-sm">{c.responsible_person ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.due_date ?? "—"}</TableCell>
                    <TableCell><Badge variant={c.status === "closed" ? "default" : c.status === "in_progress" ? "secondary" : "outline"}>{statusLabel(c.status)}</Badge></TableCell>
                    <TableCell>
                      {canEdit && <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setCreating(false); }}><Pencil className="w-4 h-4" /></Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <CapaDialog
          capa={editing}
          fiscalYear={fiscalYear}
          indicators={data?.inds ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function statusLabel(s: string) { return s === "closed" ? "ปิดแล้ว" : s === "in_progress" ? "กำลังดำเนินการ" : "เปิดอยู่"; }

function CapaDialog({ capa, fiscalYear, indicators, onClose }: {
  capa: CAPA | null; fiscalYear: number; indicators: { id: string; code: string; name_th: string }[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CAPA>(capa ?? {
    id: "", indicator_id: indicators[0]?.id ?? "", fiscal_year: fiscalYear, period_month: null,
    problem_description: "", root_cause: "", action_plan: "", responsible_person: "",
    due_date: null, status: "open", result_description: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        indicator_id: form.indicator_id, fiscal_year: form.fiscal_year, period_month: form.period_month,
        problem_description: form.problem_description, root_cause: form.root_cause || null,
        action_plan: form.action_plan, responsible_person: form.responsible_person || null,
        due_date: form.due_date || null, status: form.status, result_description: form.result_description || null,
      };
      if (capa) {
        const { error } = await supabase.from("corrective_actions").update(payload).eq("id", capa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("corrective_actions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("บันทึกแล้ว"); qc.invalidateQueries({ queryKey: ["capa"] }); onClose(); },
    onError: (e) => toast.error("บันทึกไม่สำเร็จ: " + e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{capa ? "แก้ไขแผนแก้ไข" : "เพิ่มแผนแก้ไข"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">ตัวชี้วัด</Label>
            <Select value={form.indicator_id} onValueChange={(v) => setForm({ ...form, indicator_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {indicators.map((i) => <SelectItem key={i.id} value={i.id}>{i.code} — {i.name_th}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">ปัญหา</Label><Textarea rows={2} value={form.problem_description} onChange={(e) => setForm({ ...form, problem_description: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">สาเหตุราก (Root Cause)</Label><Textarea rows={2} value={form.root_cause ?? ""} onChange={(e) => setForm({ ...form, root_cause: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">แผนแก้ไข</Label><Textarea rows={3} value={form.action_plan} onChange={(e) => setForm({ ...form, action_plan: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">ผู้รับผิดชอบ</Label><Input value={form.responsible_person ?? ""} onChange={(e) => setForm({ ...form, responsible_person: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">กำหนดเสร็จ</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value || null })} /></div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">สถานะ</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CAPA["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">เปิดอยู่</SelectItem>
                <SelectItem value="in_progress">กำลังดำเนินการ</SelectItem>
                <SelectItem value="closed">ปิดแล้ว</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">ผลการดำเนินงาน</Label><Textarea rows={2} value={form.result_description ?? ""} onChange={(e) => setForm({ ...form, result_description: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.indicator_id || !form.problem_description || !form.action_plan}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
