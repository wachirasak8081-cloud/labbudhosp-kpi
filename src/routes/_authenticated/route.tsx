import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/use-auth";
import { FiscalYearProvider } from "@/hooks/use-fiscal-year";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const title = pageTitle(pathname);

  return (
    <FiscalYearProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset>
            <header className="h-14 sticky top-0 z-30 flex items-center gap-3 border-b bg-card/95 backdrop-blur px-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
              <SidebarTrigger />
              <h1 className="text-base font-semibold truncate">{title}</h1>
              <div className="ml-auto flex items-center gap-2">
                <FiscalYearSelector />
                <UserMenu />
              </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-background">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </FiscalYearProvider>
  );
}

function pageTitle(path: string): string {
  if (path.startsWith("/dashboard/indicator")) return "รายละเอียดตัวชี้วัด";
  if (path.startsWith("/dashboard")) return "แดชบอร์ดภาพรวม";
  if (path.startsWith("/indicators/import")) return "นำเข้าตัวชี้วัดจาก Excel";
  if (path.startsWith("/indicators")) return "จัดการตัวชี้วัด";
  if (path.startsWith("/targets")) return "ทบทวนเป้าหมายประจำปี";
  if (path.startsWith("/data-entry")) return "บันทึกข้อมูล";
  if (path.startsWith("/capa")) return "แผนแก้ไข (CAPA / CQI)";
  if (path.startsWith("/reports")) return "รายงานสรุป";
  if (path.startsWith("/settings/users")) return "จัดการผู้ใช้งาน";
  if (path.startsWith("/settings/departments")) return "จัดการสาขางาน";
  if (path.startsWith("/settings/audit-logs")) return "ประวัติการเปลี่ยนแปลง";
  if (path.startsWith("/settings")) return "ตั้งค่าระบบ";
  return "ระบบ KPI / QI";
}
