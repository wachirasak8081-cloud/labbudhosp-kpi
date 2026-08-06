import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/audit-logs")({
  head: () => ({
    meta: [
      { title: "ประวัติการเปลี่ยนแปลง — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "บันทึกการเข้าใช้งานและการแก้ไขข้อมูลทั้งระบบ เพื่อการตรวจสอบย้อนกลับตามมาตรฐานคุณภาพห้องปฏิบัติการ" },
      { property: "og:title", content: "ประวัติการเปลี่ยนแปลง — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "บันทึกการเข้าใช้งานและการแก้ไขข้อมูลทั้งระบบ เพื่อการตรวจสอบย้อนกลับตามมาตรฐานคุณภาพห้องปฏิบัติการ" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/settings/audit-logs" },
      { name: "twitter:title", content: "ประวัติการเปลี่ยนแปลง — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "บันทึกการเข้าใช้งานและการแก้ไขข้อมูลทั้งระบบ เพื่อการตรวจสอบย้อนกลับตามมาตรฐานคุณภาพห้องปฏิบัติการ" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/settings/audit-logs" }],
  }),
  component: AuditPage,
});

const TABLE_LABEL: Record<string, string> = {
  indicators: "ตัวชี้วัด",
  measurements: "ผลวัด",
  corrective_actions: "แผนแก้ไข (CAPA)",
  target_history: "ประวัติเป้าหมาย",
  departments: "สาขา",
  profiles: "โปรไฟล์",
  user_roles: "สิทธิ์ผู้ใช้",
};
const ACTION_LABEL: Record<string, string> = { insert: "เพิ่ม", update: "แก้ไข", delete: "ลบ" };

type Row = {
  id: string; table_name: string; action: string; record_id: string | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
  performed_by: string | null; performed_at: string;
};

function AuditPage() {
  const { hasAnyRole } = useAuth();
  if (!hasAnyRole(["admin", "auditor"])) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">ต้องเป็นผู้ดูแลระบบหรือผู้ตรวจสอบเท่านั้น</CardContent></Card>;
  }
  return <Inner />;
}

function Inner() {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const [{ data: logs }, { data: profiles }] = await Promise.all([
        supabase.from("audit_logs").select("*").order("performed_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id, full_name"),
      ]);
      return { logs: (logs ?? []) as Row[], profiles: profiles ?? [] };
    },
  });

  const nameOf = (uid: string | null) => uid ? data?.profiles.find((p) => p.id === uid)?.full_name ?? uid.slice(0, 8) : "—";

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.logs.filter((r) => {
      if (tableFilter !== "all" && r.table_name !== tableFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (userFilter !== "all" && r.performed_by !== userFilter) return false;
      if (fromDate && new Date(r.performed_at) < new Date(fromDate)) return false;
      if (toDate && new Date(r.performed_at) > new Date(toDate + "T23:59:59")) return false;
      return true;
    });
  }, [data, tableFilter, actionFilter, userFilter, fromDate, toDate]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1"><Label className="text-xs">ตาราง</Label>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                {Object.entries(TABLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">การกระทำ</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                {Object.entries(ACTION_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">ผู้ดำเนินการ</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                {(data?.profiles ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">ตั้งแต่</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">ถึง</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เวลา</TableHead>
                <TableHead>ผู้ดำเนินการ</TableHead>
                <TableHead>ตาราง</TableHead>
                <TableHead>การกระทำ</TableHead>
                <TableHead>รหัสรายการ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">ไม่พบรายการตามเงื่อนไข</TableCell></TableRow>}
              {filtered.map((row) => (
                <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(row)}>
                  <TableCell className="text-xs">{new Date(row.performed_at).toLocaleString("th-TH")}</TableCell>
                  <TableCell className="text-sm">{nameOf(row.performed_by)}</TableCell>
                  <TableCell className="text-sm">{TABLE_LABEL[row.table_name] ?? row.table_name}</TableCell>
                  <TableCell><Badge variant={row.action === "delete" ? "destructive" : row.action === "insert" ? "default" : "secondary"}>{ACTION_LABEL[row.action] ?? row.action}</Badge></TableCell>
                  <TableCell className="text-xs font-mono">{row.record_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell><Button size="icon" variant="ghost"><Eye className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && <DiffDialog row={selected} nameOf={nameOf} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DiffDialog({ row, nameOf, onClose }: { row: Row; nameOf: (id: string | null) => string; onClose: () => void }) {
  const keys = useMemo(() => {
    const k = new Set<string>([...Object.keys(row.old_data ?? {}), ...Object.keys(row.new_data ?? {})]);
    return Array.from(k).sort();
  }, [row]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>รายละเอียดการเปลี่ยนแปลง</DialogTitle></DialogHeader>
        <div className="text-xs space-y-1 mb-3">
          <div><span className="text-muted-foreground">เวลา:</span> {new Date(row.performed_at).toLocaleString("th-TH")}</div>
          <div><span className="text-muted-foreground">ผู้ดำเนินการ:</span> {nameOf(row.performed_by)}</div>
          <div><span className="text-muted-foreground">ตาราง:</span> {TABLE_LABEL[row.table_name] ?? row.table_name} • <span className="text-muted-foreground">การกระทำ:</span> {ACTION_LABEL[row.action] ?? row.action}</div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>ฟิลด์</TableHead><TableHead>ค่าเดิม</TableHead><TableHead>ค่าใหม่</TableHead></TableRow></TableHeader>
          <TableBody>
            {keys.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">ไม่มีข้อมูลรายละเอียด</TableCell></TableRow>}
            {keys.map((k) => {
              const oldV = row.old_data?.[k]; const newV = row.new_data?.[k];
              const changed = JSON.stringify(oldV) !== JSON.stringify(newV);
              return (
                <TableRow key={k} className={changed ? "bg-amber-50/50" : ""}>
                  <TableCell className="font-mono text-xs">{k}</TableCell>
                  <TableCell className="text-xs font-mono whitespace-pre-wrap break-all max-w-[280px]">{fmtVal(oldV)}</TableCell>
                  <TableCell className="text-xs font-mono whitespace-pre-wrap break-all max-w-[280px]">{fmtVal(newV)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
function fmtVal(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}
