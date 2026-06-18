import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ListTree, ClipboardEdit, AlertTriangle, FileBarChart2,
  Users2, Building2, ScrollText, LogOut, FlaskConical,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[] };

const mainItems: Item[] = [
  { title: "แดชบอร์ด", url: "/dashboard", icon: LayoutDashboard },
  { title: "ตัวชี้วัด KPI/QI", url: "/indicators", icon: ListTree },
  { title: "บันทึกผลวัด", url: "/measurements", icon: ClipboardEdit },
  { title: "แผนแก้ไข CAPA", url: "/capa", icon: AlertTriangle },
  { title: "รายงาน", url: "/reports", icon: FileBarChart2 },
];

const adminItems: Item[] = [
  { title: "ผู้ใช้งาน", url: "/admin/users", icon: Users2, roles: ["admin"] },
  { title: "สาขางาน", url: "/admin/departments", icon: Building2, roles: ["admin"] },
  { title: "ประวัติการเปลี่ยนแปลง", url: "/admin/audit-logs", icon: ScrollText, roles: ["admin", "auditor"] },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile, roles, hasAnyRole, signOut, user } = useAuth();
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  const visibleAdmin = adminItems.filter((i) => !i.roles || hasAnyRole(i.roles));

  const roleLabel = (r: AppRole) => ({
    admin: "ผู้ดูแลระบบ", manager: "ผู้จัดการ", staff: "เจ้าหน้าที่", auditor: "ผู้ตรวจสอบ",
  }[r]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-semibold text-sm leading-tight">เทคนิคการแพทย์</div>
            <div className="text-xs text-sidebar-foreground/70 leading-tight">รพ.พุทธชินราช</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>เมนูหลัก</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>การจัดการระบบ</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="text-xs font-medium truncate">{profile?.full_name || user?.email}</div>
          <div className="text-[10px] text-sidebar-foreground/70 truncate">
            {roles.length > 0 ? roles.map(roleLabel).join(", ") : "ยังไม่มีบทบาท"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { void signOut(); }}
          className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="w-4 h-4" />
          <span className="group-data-[collapsible=icon]:hidden ml-2">ออกจากระบบ</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
