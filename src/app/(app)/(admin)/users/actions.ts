"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface InviteUserInput {
  email: string;
  roleProfileId: string;
}

interface InviteUserResult {
  error?: string;
}

async function callerCanManageUsers(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "users" });
  return Boolean(data?.[0]?.can_manage);
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    input.email,
  );
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "No se pudo invitar al usuario" };
  }

  const { error: insertError } = await admin.from("app_users").insert({
    id: invited.user.id,
    email: input.email,
    role_profile_id: input.roleProfileId,
  });
  if (insertError) {
    return { error: insertError.message };
  }

  return {};
}
