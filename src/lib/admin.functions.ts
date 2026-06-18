import { createServerFn } from "@tanstack/react-start";

/**
 * Idempotently seed the default admin account.
 * Called from the auth page mount so the app is usable on first load.
 */
export const seedDefaultAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ADMIN_EMAIL = "admin@lab.local";
  const ADMIN_PASSWORD = "Lab14241";
  const ADMIN_NAME = "ผู้ดูแลระบบ";

  // Check if any admin exists
  const { data: existingRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);

  if (existingRoles && existingRoles.length > 0) {
    return { ok: true, seeded: false };
  }

  // Try to find user by email via auth admin
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  let user = list?.users?.find((u) => u.email === ADMIN_EMAIL);

  if (!user) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME },
    });
    if (error) throw error;
    user = created.user ?? undefined;
  }

  if (!user) return { ok: false, seeded: false };

  // Ensure profile
  await supabaseAdmin
    .from("profiles")
    .upsert({ id: user.id, full_name: ADMIN_NAME, is_active: true }, { onConflict: "id" });

  // Ensure admin role (trigger inserts 'staff' by default; add admin too)
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });

  return { ok: true, seeded: true };
});
