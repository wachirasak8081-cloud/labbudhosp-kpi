import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ListTree, ClipboardEdit, AlertTriangle, FileBarChart2,
  Settings, FlaskConical,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[] };

const items: Item[] = [
  { title: "แดชบอร์ดภาพรวม", url: "/dashboard", icon: LayoutDashboard },
  { title: "ตัวชี้วัด", url: "/indicators", icon: ListTree, roles: ["admin", "manager"] },
  { title: "บันทึกข้อมูล", url: "/data-entry", icon: ClipboardEdit, roles: ["staff", "manager", "admin"] },
  { title: "CAPA / CQI", url: "/capa", icon: AlertTriangle },
  { title: "รายงาน", url: "/reports", icon: FileBarChart2 },
  { title: "ตั้งค่า", url: "/settings", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { hasAnyRole } = useAuth();
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const visible = items.filter((i) => !i.roles || hasAnyRole(i.roles));

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
              {visible.map((item) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
