import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type AppRole = "admin" | "manager" | "staff" | "auditor";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("ต้องเป็นผู้ดูแลระบบเท่านั้น");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const userIds = (list?.users ?? []).map((u) => u.id);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, department_id, is_active").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (list?.users ?? []).map((u) => ({
      id: u.id, email: u.email ?? "", created_at: u.created_at,
      profile: profMap.get(u.id) ?? null,
      roles: roleMap.get(u.id) ?? [],
    }));
  });

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  department_id: z.string().uuid().nullable(),
  roles: z.array(z.enum(["admin", "manager", "staff", "auditor"])).min(1),
});

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateUserSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.full_name, department_id: data.department_id, is_active: true }, { onConflict: "id" });
    // Trigger inserts 'staff' by default — replace with requested roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert(data.roles.map((role) => ({ user_id: uid, role })));
    return { ok: true, id: uid };
  });

const UpdateUserSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().min(1),
  department_id: z.string().uuid().nullable(),
  is_active: z.boolean(),
  roles: z.array(z.enum(["admin", "manager", "staff", "auditor"])).min(1),
});

export const updateAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateUserSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").upsert({ id: data.user_id, full_name: data.full_name, department_id: data.department_id, is_active: data.is_active }, { onConflict: "id" });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert(data.roles.map((role) => ({ user_id: data.user_id, role: role as AppRole })));
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("ลบบัญชีตัวเองไม่ได้");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
