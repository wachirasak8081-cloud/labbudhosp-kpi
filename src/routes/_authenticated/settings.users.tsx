import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { listUsers, createAppUser, updateAppUser, deleteAppUser } from "@/lib/users.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/users")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "จัดการผู้ใช้งาน — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "เพิ่ม แก้ไข และกำหนดบทบาทผู้ใช้งานระบบติดตามตัวชี้วัด KPI/QI ของกลุ่มงานเทคนิคการแพทย์" },
      { property: "og:title", content: "จัดการผู้ใช้งาน — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "เพิ่ม แก้ไข และกำหนดบทบาทผู้ใช้งานระบบติดตามตัวชี้วัด KPI/QI ของกลุ่มงานเทคนิคการแพทย์" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/settings/users" },
      { name: "twitter:title", content: "จัดการผู้ใช้งาน — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "เพิ่ม แก้ไข และกำหนดบทบาทผู้ใช้งานระบบติดตามตัวชี้วัด KPI/QI ของกลุ่มงานเทคนิคการแพทย์" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/settings/users" }],
  }),
  component: AdminUsersPage,
});

type AppUser = { id: string; email: string; created_at: string; profile: { full_name: string; department_id: string | null; is_active: boolean } | null; roles: string[]; department_ids: string[] };

const ROLE_LABELS: Record<AppRole, string> = { admin: "ผู้ดูแลระบบ", manager: "ผู้จัดการ", staff: "เจ้าหน้าที่", auditor: "ผู้ตรวจสอบ" };

function AdminUsersPage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">ต้องเป็นผู้ดูแลระบบเท่านั้น</CardContent></Card>;
  }
  return <UsersInner />;
}

function UsersInner() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const deleteFn = useServerFn(deleteAppUser);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["app-users"],
    queryFn: () => listFn() as Promise<AppUser[]>,
  });

  const { data: depts } = useQuery({
    queryKey: ["departments-active"],
    queryFn: async () => (await supabase.from("departments").select("id, name_th").eq("is_active", true).order("name_th")).data ?? [],
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { user_id: id } }),
    onSuccess: () => { toast.success("ลบผู้ใช้แล้ว"); qc.invalidateQueries({ queryKey: ["app-users"] }); },
    onError: (e: Error) => toast.error("ลบไม่สำเร็จ: " + e.message),
  });

  const deptMap = new Map((depts ?? []).map((d) => [d.id, d.name_th]));

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">จัดการบัญชีผู้ใช้และบทบาทในระบบ</p>
        <Button onClick={() => { setEditing(null); setCreating(true); }}><Plus className="w-4 h-4 mr-2" />เพิ่มผู้ใช้</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อ-อีเมล</TableHead>
                <TableHead>สาขางาน</TableHead>
                <TableHead>บทบาท</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{u.profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.department_ids.length ? (
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {u.department_ids.map((d) => <Badge key={d} variant="secondary" className="text-[10px]">{deptMap.get(d) ?? d}</Badge>)}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => <Badge key={r} variant="outline">{ROLE_LABELS[r as AppRole] ?? r}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.profile?.is_active ? "default" : "secondary"}>{u.profile?.is_active ? "ใช้งาน" : "ปิดใช้งาน"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(u); setCreating(false); }}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm(`ลบ ${u.email} ?`)) del.mutate(u.id); }} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {(editing || creating) && (
        <UserDialog user={editing} departments={depts ?? []} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}

function UserDialog({ user, departments, onClose }: { user: AppUser | null; departments: { id: string; name_th: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createAppUser);
  const updateFn = useServerFn(updateAppUser);
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(user?.profile?.full_name ?? "");
  const [deptIds, setDeptIds] = useState<string[]>(user?.department_ids ?? []);
  const [deptSearch, setDeptSearch] = useState("");
  const [active, setActive] = useState<boolean>(user?.profile?.is_active ?? true);
  const [roles, setRoles] = useState<AppRole[]>((user?.roles as AppRole[]) ?? ["staff"]);

  const toggleDept = (id: string) => setDeptIds((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const toggleRole = (r: AppRole) => setRoles((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);

  const save = useMutation({
    mutationFn: async () => {
      if (user) {
        await updateFn({ data: { user_id: user.id, full_name: fullName, department_ids: deptIds, is_active: active, roles } });
      } else {
        await createFn({ data: { email, password, full_name: fullName, department_ids: deptIds, roles } });
      }
    },
    onSuccess: () => { toast.success(user ? "อัปเดตแล้ว" : "เพิ่มผู้ใช้แล้ว"); qc.invalidateQueries({ queryKey: ["app-users"] }); onClose(); },
    onError: (e: Error) => toast.error("บันทึกไม่สำเร็จ: " + e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{user ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">อีเมล</Label><Input type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} /></div>
          {!user && <div className="space-y-1"><Label className="text-xs">รหัสผ่าน</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
          <div className="space-y-1"><Label className="text-xs">ชื่อ-นามสกุล</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">สาขางาน (เลือกได้หลายรายการ)</Label>
              <span className="text-[11px] text-muted-foreground">เลือกแล้ว {deptIds.length}</span>
            </div>
            <Input placeholder="ค้นหาสาขางาน..." value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)} className="h-8" />
            <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
              {departments
                .filter((d) => d.name_th.toLowerCase().includes(deptSearch.toLowerCase()))
                .map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={deptIds.includes(d.id)} onChange={() => toggleDept(d.id)} />
                    {d.name_th}
                  </label>
                ))}
              {departments.length === 0 && <div className="text-xs text-muted-foreground">ไม่มีข้อมูลสาขางาน</div>}
            </div>
            {deptIds.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {deptIds.map((id) => (
                  <Badge key={id} variant="secondary" className="text-[10px]">
                    {departments.find((d) => d.id === id)?.name_th ?? id}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">บทบาท</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {(["admin", "manager", "staff", "auditor"] as AppRole[]).map((r) => (
                <label key={r} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          {user && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> ใช้งาน
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !fullName || (!user && (!email || !password)) || roles.length === 0}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
