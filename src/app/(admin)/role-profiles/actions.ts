"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface RoleProfileInput {
  id?: string;
  name: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_deactivate: boolean;
  can_manage_platform: boolean;
}

export async function saveRoleProfile(input: RoleProfileInput) {
  const supabase = await createClient();
  const { id, ...fields } = input;

  const query = id
    ? supabase.from("role_profiles").update(fields).eq("id", id)
    : supabase.from("role_profiles").insert(fields);

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath("/role-profiles");
  return {};
}
