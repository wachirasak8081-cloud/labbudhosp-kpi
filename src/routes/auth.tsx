import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { seedDefaultAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "เข้าสู่ระบบ — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "description", content: "เข้าสู่ระบบสำหรับเจ้าหน้าที่กลุ่มงานเทคนิคการแพทย์ เพื่อบันทึกข้อมูลและติดตามตัวชี้วัด KPI/QI ของโรงพยาบาลพุทธชินราช" },
      { property: "og:title", content: "เข้าสู่ระบบ — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { property: "og:description", content: "เข้าสู่ระบบสำหรับเจ้าหน้าที่กลุ่มงานเทคนิคการแพทย์ เพื่อบันทึกข้อมูลและติดตามตัวชี้วัด KPI/QI ของโรงพยาบาลพุทธชินราช" },
      { property: "og:url", content: "https://labbudhosp-kpi.lovable.app/auth" },
      { name: "twitter:title", content: "เข้าสู่ระบบ — ระบบติดตาม KPI/QI กลุ่มงานเทคนิคการแพทย์ รพ.พุทธชินราช" },
      { name: "twitter:description", content: "เข้าสู่ระบบสำหรับเจ้าหน้าที่กลุ่มงานเทคนิคการแพทย์ เพื่อบันทึกข้อมูลและติดตามตัวชี้วัด KPI/QI ของโรงพยาบาลพุทธชินราช" },
    ],
    links: [{ rel: "canonical", href: "https://labbudhosp-kpi.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("admin@lab.local");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Seed default admin on first load (idempotent)
  useEffect(() => { seedDefaultAdmin().catch(() => {}); }, []);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  const translateError = (msg: string): string => {
    if (/invalid login/i.test(msg)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    if (/email not confirmed/i.test(msg)) return "อีเมลยังไม่ได้ยืนยัน";
    if (/rate/i.test(msg)) return "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่";
    return "เข้าสู่ระบบไม่สำเร็จ: " + msg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) { toast.error(translateError(error.message)); return; }
    toast.success("เข้าสู่ระบบสำเร็จ");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-secondary via-background to-accent/40">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <FlaskConical className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground whitespace-pre-line">
            ระบบติดตามตัวชี้วัด KPI/QI{"\n"}กลุ่มงานเทคนิคการแพทย์{"\n"}และพยาธิวิทยาคลินิก
          </h1>
          <p className="text-sm text-muted-foreground mt-1">โรงพยาบาลพุทธชินราช พิษณุโลก</p>
          <p className="text-xs text-muted-foreground mt-1">จัดทำโดย ทนพ.วชิรศักดิ์ ภูริสวัสดิ์</p>
        </div>
        <Card className="border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle>เข้าสู่ระบบ</CardTitle>
            <CardDescription>กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">อีเมล</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">รหัสผ่าน</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังเข้าสู่ระบบ...</> : "เข้าสู่ระบบ"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              ผู้ดูแลระบบเริ่มต้น: <code className="px-1 py-0.5 rounded bg-muted">admin@lab.local</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
