import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  component: AuditPage,
});

const TABLE_LABEL: Record<string, string> = {
  indicators: "ตัวชี้วัด",
  measurements: "ผลวัด",
  corrective_actions: "แผนแก้ไข (CAPA)",
  target_history: "ประวัติเป้าหมาย",
};
const ACTION_LABEL: Record<string, string> = { insert: "เพิ่ม", update: "แก้ไข", delete: "ลบ" };

function AuditPage() {
  const { hasAnyRole } = useAuth();
  if (!hasAnyRole(["admin", "auditor"])) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">ต้องเป็นผู้ดูแลระบบหรือผู้ตรวจสอบเท่านั้น</CardContent></Card>;
  }
  return <Inner />;
}

function Inner() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_logs").select("*").order("performed_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เวลา</TableHead>
              <TableHead>ตาราง</TableHead>
              <TableHead>การกระทำ</TableHead>
              <TableHead>รหัสรายการ</TableHead>
              <TableHead>ผู้ทำรายการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">ยังไม่มีบันทึก</TableCell></TableRow>}
            {(data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs">{new Date(row.performed_at).toLocaleString("th-TH")}</TableCell>
                <TableCell className="text-sm">{TABLE_LABEL[row.table_name] ?? row.table_name}</TableCell>
                <TableCell><Badge variant={row.action === "delete" ? "destructive" : row.action === "insert" ? "default" : "secondary"}>{ACTION_LABEL[row.action] ?? row.action}</Badge></TableCell>
                <TableCell className="text-xs font-mono">{row.record_id ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono">{row.performed_by ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
