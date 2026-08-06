import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/departments")({
  head: () => ({
    meta: [
      { title: "จัดการสาขางาน — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "จัดการข้อมูลสาขางานและแผนกภายในกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลพุทธชินราช พิษณุโลก" },
      { property: "og:title", content: "จัดการสาขางาน — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "จัดการข้อมูลสาขางานและแผนกภายในกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลพุทธชินราช พิษณุโลก" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/settings/departments" },
      { name: "twitter:title", content: "จัดการสาขางาน — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "จัดการข้อมูลสาขางานและแผนกภายในกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลพุทธชินราช พิษณุโลก" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/settings/departments" }],
  }),
  component: DepartmentsPage,
});

type Dept = { id: string; code: string; name_th: string; is_active: boolean };

function DepartmentsPage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">ต้องเป็นผู้ดูแลระบบเท่านั้น</CardContent></Card>;
  }
  return <Inner />;
}

function Inner() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Dept | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name_th")).data as Dept[] | null,
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">จัดการรายชื่อสาขางานในกลุ่มงานเทคนิคการแพทย์</p>
        <Button onClick={() => { setEditing(null); setCreating(true); }}><Plus className="w-4 h-4 mr-2" />เพิ่มสาขา</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อสาขา</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.code}</TableCell>
                  <TableCell className="text-sm">{d.name_th}</TableCell>
                  <TableCell><Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "ใช้งาน" : "ปิดใช้งาน"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setCreating(false); }}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => {
                      if (!confirm(`ลบสาขา "${d.name_th}" ?`)) return;
                      const { error } = await supabase.from("departments").delete().eq("id", d.id);
                      if (error) toast.error("ลบไม่สำเร็จ: " + error.message);
                      else { toast.success("ลบแล้ว"); qc.invalidateQueries({ queryKey: ["departments-all"] }); }
                    }}><Trash2 className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {(editing || creating) && <DeptDialog dept={editing} onClose={() => { setEditing(null); setCreating(false); }} onSaved={() => qc.invalidateQueries({ queryKey: ["departments-all"] })} />}
    </div>
  );
}

function DeptDialog({ dept, onClose, onSaved }: { dept: Dept | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(dept?.code ?? "");
  const [name, setName] = useState(dept?.name_th ?? "");
  const [active, setActive] = useState(dept?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      if (dept) {
        const { error } = await supabase.from("departments").update({ code, name_th: name, is_active: active }).eq("id", dept.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert({ code, name_th: name, is_active: active });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("บันทึกแล้ว"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error("บันทึกไม่สำเร็จ: " + e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{dept ? "แก้ไขสาขา" : "เพิ่มสาขา"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">รหัส</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">ชื่อสาขา</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> ใช้งาน</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !code || !name}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
