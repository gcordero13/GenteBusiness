"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DEACTIVATE_BAN_DURATION = "876000h"; // ~100 years; effectively indefinite until reactivated

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

interface UpdateUserFullNameInput {
  userId: string;
  fullName: string;
}

interface SetUserStatusInput {
  userId: string;
  status: "active" | "deactivated";
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

export async function updateUserFullName(
  input: UpdateUserFullNameInput,
): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_users")
    .update({ full_name: input.fullName || null })
    .eq("id", input.userId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/users");
  return {};
}

export async function setUserStatus(input: SetUserStatusInput): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(input.userId, {
    ban_duration: input.status === "deactivated" ? DEACTIVATE_BAN_DURATION : "none",
  });
  if (banError) {
    return { error: banError.message };
  }

  const { error } = await admin
    .from("app_users")
    .update({ status: input.status })
    .eq("id", input.userId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/users");
  return {};
}

export async function inviteContactAsUser(contactId: string): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();

  const { data: contact, error: contactError } = await admin
    .from("contacts")
    .select("first_name, last_name, email")
    .eq("id", contactId)
    .single();
  if (contactError || !contact?.email) {
    return { error: "El contacto no tiene un correo válido" };
  }

  const { data: existing } = await admin
    .from("app_users")
    .select("id")
    .eq("email", contact.email)
    .maybeSingle();
  if (existing) {
    return { error: "Este correo ya tiene acceso a la plataforma" };
  }

  const { data: viewerProfile } = await admin
    .from("role_profiles")
    .select("id")
    .eq("name", "Viewer")
    .maybeSingle();
  if (!viewerProfile) {
    return { error: "No se encontró el perfil Viewer" };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    contact.email,
  );
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "No se pudo invitar al usuario" };
  }

  const { error: insertError } = await admin.from("app_users").insert({
    id: invited.user.id,
    email: contact.email,
    full_name: `${contact.first_name} ${contact.last_name}`,
    role_profile_id: viewerProfile.id,
  });
  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath("/users");
  return {};
}

export async function deleteUser(userId: string): Promise<InviteUserResult> {
  if (!(await callerCanManageUsers())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/users");
  return {};
}
