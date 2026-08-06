import { createFileRoute, Link } from "@tanstack/react-router";
import { Users2, Building2, ScrollText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "ตั้งค่าระบบ — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "ตั้งค่าระบบติดตามตัวชี้วัด จัดการผู้ใช้งาน สาขางาน และตรวจสอบประวัติการเปลี่ยนแปลงข้อมูลทั้งระบบ" },
      { property: "og:title", content: "ตั้งค่าระบบ — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "ตั้งค่าระบบติดตามตัวชี้วัด จัดการผู้ใช้งาน สาขางาน และตรวจสอบประวัติการเปลี่ยนแปลงข้อมูลทั้งระบบ" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/settings" },
      { name: "twitter:title", content: "ตั้งค่าระบบ — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "ตั้งค่าระบบติดตามตัวชี้วัด จัดการผู้ใช้งาน สาขางาน และตรวจสอบประวัติการเปลี่ยนแปลงข้อมูลทั้งระบบ" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/settings" }],
  }),
  component: SettingsIndex,
});

function SettingsIndex() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">ต้องเป็นผู้ดูแลระบบเท่านั้น</CardContent></Card>;
  }
  const items = [
    { to: "/settings/users", title: "จัดการผู้ใช้งาน", desc: "เพิ่ม / แก้ไข / กำหนดบทบาทผู้ใช้", icon: Users2 },
    { to: "/settings/departments", title: "จัดการสาขางาน", desc: "ข้อมูลสาขางาน / แผนกในกลุ่มงาน", icon: Building2 },
    { to: "/settings/audit-logs", title: "ประวัติการเปลี่ยนแปลง", desc: "บันทึกการแก้ไขข้อมูลทั้งระบบ", icon: ScrollText },
  ] as const;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="block">
          <Card className="hover:border-primary/60 transition">
            <CardContent className="p-5 flex gap-4">
              <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <i.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold">{i.title}</div>
                <div className="text-sm text-muted-foreground">{i.desc}</div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
