"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ModulePermissionInput {
  module_id: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_deactivate: boolean;
  can_manage: boolean;
  can_authorize: boolean;
}

export interface RoleProfileInput {
  id?: string;
  name: string;
  permissions: ModulePermissionInput[];
}

export async function saveRoleProfile(input: RoleProfileInput) {
  const supabase = await createClient();
  const { id, name, permissions } = input;

  const profileQuery = id
    ? supabase.from("role_profiles").update({ name }).eq("id", id).select().single()
    : supabase.from("role_profiles").insert({ name }).select().single();

  const { data: profile, error: profileError } = await profileQuery;
  if (profileError || !profile) {
    return { error: profileError?.message ?? "No se pudo guardar el perfil" };
  }

  const rows = permissions.map((p) => ({ ...p, role_profile_id: profile.id }));
  const { error: permissionsError } = await supabase
    .from("role_profile_permissions")
    .upsert(rows, { onConflict: "role_profile_id,module_id" });

  if (permissionsError) {
    return { error: permissionsError.message };
  }

  revalidatePath("/role-profiles");
  return {};
}

export async function deleteRoleProfile(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("role_profiles").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}

export async function addComplaintViewer(appUserId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("complaint_viewers").insert({ app_user_id: appUserId });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}

export async function removeComplaintViewer(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("complaint_viewers").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}
