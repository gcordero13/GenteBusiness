import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Grants a contact's email login access with view-only ("Viewer") permissions
 * if it doesn't already have an app_users row. An admin can later change the
 * assigned role profile from the Users page. Safe to call for every contact
 * save — it's a no-op if the email is empty or already provisioned.
 */
export async function provisionContactLogin(email: string | null | undefined): Promise<void> {
  if (!email) return;
  const admin = createAdminClient();

  const { data: existingAppUser } = await admin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingAppUser) return;

  const { data: viewerProfile } = await admin
    .from("role_profiles")
    .select("id")
    .eq("name", "Viewer")
    .maybeSingle();
  if (!viewerProfile) return;

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  let authUserId = invited?.user?.id;

  if (inviteError || !authUserId) {
    // Most likely: an auth user with this email already exists (e.g. it was
    // provisioned before, or the invite email service is misconfigured).
    // Look them up instead of failing the whole contact save.
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) return;
    authUserId = found.id;
  }

  await admin.from("app_users").insert({
    id: authUserId,
    email,
    role_profile_id: viewerProfile.id,
  });
}
