import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

/**
 * A test user whose role profile is a throwaway one holding exactly the
 * given Aprendizaje permissions. The tests used to borrow the real "Viewer"
 * profile, but admins legitimately change real profiles in Perfiles de rol
 * (e.g. taking "Ver" away from Viewer), which silently broke every test.
 */
export async function createAprendizajeTestUser(
  perms: { canView: boolean; canManage: boolean },
  /** Other modules (by key) the profile gets "Ver" on, e.g. for module tutorials. */
  otherModules: string[] = [],
): Promise<TestUser> {
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("role_profiles")
    .insert({ name: `test-aprendizaje-${randomUUID()}` })
    .select("id")
    .single();
  if (profileError || !profile) throw new Error(`create test role profile: ${profileError?.message}`);

  const { data: module, error: moduleError } = await admin.from("modules").select("id").eq("key", "aprendizaje").single();
  if (moduleError || !module) throw new Error(`find aprendizaje module: ${moduleError?.message}`);

  const { error: permError } = await admin.from("role_profile_permissions").insert({
    role_profile_id: profile.id,
    module_id: module.id,
    can_view: perms.canView,
    can_manage: perms.canManage,
  });
  if (permError) throw new Error(`grant test permissions: ${permError.message}`);

  if (otherModules.length > 0) {
    const { data: others, error: othersError } = await admin.from("modules").select("id").in("key", otherModules);
    if (othersError || (others ?? []).length !== otherModules.length) {
      throw new Error(`find modules ${otherModules.join(", ")}: ${othersError?.message ?? "not found"}`);
    }
    const { error } = await admin
      .from("role_profile_permissions")
      .insert((others ?? []).map((m) => ({ role_profile_id: profile.id, module_id: m.id, can_view: true })));
    if (error) throw new Error(`grant other modules: ${error.message}`);
  }

  // createTestUser needs an existing profile name; the user is moved to the
  // throwaway profile right after. Permissions are read per query, so the
  // existing session picks the new profile up without signing in again.
  const user = await createTestUser("Viewer");
  const { error: moveError } = await admin.from("app_users").update({ role_profile_id: profile.id }).eq("id", user.id);
  if (moveError) {
    await deleteTestUser(user.id);
    throw new Error(`assign test role profile: ${moveError.message}`);
  }
  return user;
}

/** Deletes the user, then its throwaway profile (which can't be deleted while assigned). */
export async function deleteAprendizajeTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  const admin = createAdminClient();
  const { data: appUser } = await admin.from("app_users").select("role_profile_id").eq("id", user.id).maybeSingle();
  await deleteTestUser(user.id);
  if (appUser?.role_profile_id) {
    const { data: profile } = await admin.from("role_profiles").select("name").eq("id", appUser.role_profile_id).maybeSingle();
    if (profile?.name?.startsWith("test-aprendizaje-")) {
      const { error } = await admin.from("role_profiles").delete().eq("id", appUser.role_profile_id);
      if (error) console.warn(`failed to delete test role profile: ${error.message}`);
    }
  }
}
