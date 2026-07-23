"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface InviteUserInput {
  email: string;
  roleProfileId: string;
  /**
   * When provided, the user is created directly with this password
   * (email_confirm: true) instead of receiving an email invite. Useful when
   * outbound email isn't configured/reliable yet.
   */
  password?: string;
}

interface InviteUserResult {
  error?: string;
}

interface SetUserPasswordInput {
  userId: string;
  password: string;
}

interface UpdateUserRoleProfileInput {
  userId: string;
  roleProfileId: string;
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

  const { data: created, error: createError } = input.password
    ? await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      })
    : await admin.auth.admin.inviteUserByEmail(input.email);
  if (createError || !created.user) {
    return { error: createError?.message ?? "No se pudo crear al usuario" };
  }

  const { error: insertError } = await admin.from("app_users").insert({
    id: created.user.id,
    email: input.email,
    role_profile_id: input.roleProfileId,
  });
  if (insertError) {
    return { error: insertError.message };
  }

  return {};
}

export async function setUserPassword(input: SetUserPasswordInput): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.password,
  });
  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function updateUserRoleProfile(
  input: UpdateUserRoleProfileInput,
): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_users")
    .update({ role_profile_id: input.roleProfileId })
    .eq("id", input.userId);
  if (error) {
    return { error: error.message };
  }

  return {};
}
