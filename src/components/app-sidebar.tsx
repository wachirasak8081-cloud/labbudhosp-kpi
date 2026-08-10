import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, ListTree, ClipboardEdit, AlertTriangle, FileBarChart2,
  Settings, Target,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/labbudhosp-kpi-logo.png.asset.json";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[]; key?: string };

const items: Item[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "ตัวชี้วัด", url: "/indicators", icon: ListTree, roles: ["admin", "manager", "auditor"] },
  { title: "บันทึกข้อมูลรายเดือน", url: "/data-entry", icon: ClipboardEdit, roles: ["staff", "manager", "admin", "auditor"], key: "data-entry" },
  { title: "CAPA / CQI", url: "/capa", icon: AlertTriangle },
  { title: "ทบทวนเป้าหมาย", url: "/targets", icon: Target, roles: ["admin", "manager", "auditor"] },
  { title: "รายงาน", url: "/reports", icon: FileBarChart2 },
  { title: "ตั้งค่า", url: "/settings", icon: Settings, roles: ["admin"] },
];

function usePendingCount() {
  const { fiscalYear } = useFiscalYear();
  const { profile, hasAnyRole, user } = useAuth();
  const isStaff = !hasAnyRole(["admin", "manager"]);
  const month = new Date().getMonth() + 1;

  return useQuery({
    enabled: !!user,
    queryKey: ["pending-count", fiscalYear, month, profile?.department_id, isStaff],
    queryFn: async () => {
      let indQ = supabase.from("indicators").select("id, department_id").eq("is_active", true).eq("is_leaf", true);
      if (isStaff && profile?.department_id) indQ = indQ.eq("department_id", profile.department_id);
      const [{ data: inds }, { data: meas }] = await Promise.all([
        indQ,
        supabase.from("measurements").select("indicator_id, status").eq("fiscal_year", fiscalYear).eq("period_month", month),
      ]);
      const statusBy = new Map<string, string>();
      (meas ?? []).forEach((m) => statusBy.set(m.indicator_id, m.status));
      let pending = 0;
      (inds ?? []).forEach((i) => {
        const s = statusBy.get(i.id);
        if (!s || s === "draft") pending++;
      });
      return pending;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { hasAnyRole } = useAuth();
  const { data: pending } = usePendingCount();
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const visible = items.filter((i) => !i.roles || hasAnyRole(i.roles));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
            <img src={logoAsset.url} alt="โลโก้ LabBudhosp-KPI" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-semibold text-[11px] leading-tight whitespace-pre-line">
              ระบบติดตามตัวชี้วัด KPI/QI{"\n"}กลุ่มงานเทคนิคการแพทย์{"\n"}และพยาธิวิทยาคลินิก
            </div>
            <div className="text-[10px] text-sidebar-foreground/70 leading-tight whitespace-pre-line">
              โรงพยาบาลพุทธชินราช พิษณุโลก{"\n\n\n"}จัดทำโดย ทนพ.วชิรศักดิ์ ภูริสวัสดิ์
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>เมนูหลัก</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const showBadge = item.key === "data-entry" && (pending ?? 0) > 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span className="flex-1">{item.title}</span>
                        {showBadge && (
                          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] group-data-[collapsible=icon]:hidden">
                            {pending}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
