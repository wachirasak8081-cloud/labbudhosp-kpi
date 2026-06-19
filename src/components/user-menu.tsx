import { useQuery } from "@tanstack/react-query";
import { LogOut, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "ผู้ดูแลระบบ",
  manager: "ผู้จัดการ",
  staff: "เจ้าหน้าที่",
  auditor: "ผู้ตรวจสอบ",
};

export function UserMenu() {
  const { user, profile, roles, signOut } = useAuth();

  const { data: dept } = useQuery({
    queryKey: ["my-dept", profile?.department_id],
    enabled: !!profile?.department_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("departments").select("name_th").eq("id", profile!.department_id!).maybeSingle();
      return data?.name_th ?? null;
    },
  });

  const name = profile?.full_name || user?.email || "ผู้ใช้งาน";
  const roleText = roles.length ? roles.map((r) => ROLE_LABEL[r]).join(" • ") : "ยังไม่มีบทบาท";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 px-2 gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <UserCircle2 className="w-5 h-5" />
          </div>
          <div className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium max-w-[160px] truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground max-w-[160px] truncate">
              {roleText}{dept ? ` · ${dept}` : ""}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-1">
          <div className="font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          <div className="flex flex-wrap gap-1 pt-1">
            {roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-[10px]">{ROLE_LABEL[r]}</Badge>
            ))}
          </div>
          {dept && <div className="text-xs text-muted-foreground pt-1">สาขา: {dept}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { void signOut(); }} className="text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4 mr-2" />ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
