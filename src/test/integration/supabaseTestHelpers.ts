import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type TestRoleProfileName = "Viewer" | "Editor" | "Super Admin";

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const TEST_PASSWORD = "test-password-" + randomUUID();

export async function createTestUser(
  roleProfileName: TestRoleProfileName,
): Promise<TestUser> {
  const admin = createAdminClient();
  const email = `test-${randomUUID()}@example.com`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`failed to create test auth user: ${createError?.message}`);
  }

  try {
    const { data: profile, error: profileError } = await admin
      .from("role_profiles")
      .select("id")
      .eq("name", roleProfileName)
      .single();
    if (profileError || !profile) {
      throw new Error(`failed to find role profile "${roleProfileName}": ${profileError?.message}`);
    }

    const { error: appUserError } = await admin.from("app_users").insert({
      id: created.user.id,
      email,
      role_profile_id: profile.id,
    });
    if (appUserError) {
      throw new Error(`failed to insert app_users row: ${appUserError.message}`);
    }

    const client = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: TEST_PASSWORD,
    });
    if (signInError) {
      throw new Error(`failed to sign in as test user: ${signInError.message}`);
    }

    return { id: created.user.id, email, client };
  } catch (err) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw err;
  }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { error: appUserError } = await admin.from("app_users").delete().eq("id", userId);
  if (appUserError) {
    console.warn(`failed to delete app_users row for ${userId}: ${appUserError.message}`);
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.warn(`failed to delete auth user ${userId}: ${deleteUserError.message}`);
  }
}
