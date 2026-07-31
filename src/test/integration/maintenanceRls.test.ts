import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function createMaintenanceProfile(overrides: { can_view?: boolean; can_add?: boolean; can_delete?: boolean }) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("role_profiles")
    .insert({ name: `Maintenance Test ${Date.now()}-${Math.random().toString(36).slice(2)}` })
    .select()
    .single();
  const profileId = profile!.id as string;

  const { data: moduleRow } = await admin.from("modules").select("id").eq("key", "maintenance").single();

  await admin.from("role_profile_permissions").insert({
    role_profile_id: profileId,
    module_id: moduleRow!.id,
    can_view: overrides.can_view ?? false,
    can_add: overrides.can_add ?? false,
    can_edit: false,
    can_delete: overrides.can_delete ?? false,
    can_deactivate: false,
    can_manage: false,
    can_authorize: false,
  });

  return profileId;
}

async function assignProfile(userId: string, profileId: string) {
  const admin = createAdminClient();
  await admin.from("app_users").update({ role_profile_id: profileId }).eq("id", userId);
}

async function makeContact() {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").insert({ name: "Maintenance Test Co" }).select().single();
  const { data: contact } = await admin
    .from("contacts")
    .insert({ first_name: "Test", last_name: "Contact", company_id: company!.id })
    .select()
    .single();
  return { companyId: company!.id as string, contactId: contact!.id as string };
}

describe("maintenance_records RLS", () => {
  let user: TestUser | undefined;
  let profileId: string;
  let contactId: string;
  let companyId: string;
  let recordId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (recordId) await admin.from("maintenance_records").delete().eq("id", recordId);
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (user) await deleteTestUser(user.id);
    if (profileId) await admin.from("role_profiles").delete().eq("id", profileId);
    user = undefined;
    recordId = "";
    contactId = "";
    companyId = "";
    profileId = "";
  });

  it("blocks a user without can_add from creating a record", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: false });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { error } = await user.client.from("maintenance_records").insert({
      token: `test-${Date.now()}`,
      contact_id: contactId,
      created_by: user.id,
      first_name: "Test",
      last_name: "Contact",
    });

    expect(error).not.toBeNull();
  });

  it("lets a user with can_add create a record and read it back", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: true });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data, error } = await user.client
      .from("maintenance_records")
      .insert({
        token: `test-${Date.now()}`,
        contact_id: contactId,
        created_by: user.id,
        first_name: "Test",
        last_name: "Contact",
      })
      .select()
      .single();

    expect(error).toBeNull();
    recordId = data!.id;
  });

  it("blocks a user without can_view from reading records", async () => {
    ({ contactId, companyId } = await makeContact());
    const admin = createAdminClient();
    const { data: created } = await admin
      .from("maintenance_records")
      .insert({ token: `test-${Date.now()}`, contact_id: contactId, created_by: (await createTestUser("Viewer")).id, first_name: "Test", last_name: "Contact" })
      .select()
      .single();
    recordId = created!.id;

    profileId = await createMaintenanceProfile({ can_view: false });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data } = await user.client.from("maintenance_records").select("*").eq("id", recordId);

    expect(data).toEqual([]);
  });

  it("blocks a user without can_delete from deleting a record", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: true, can_delete: false });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data: created } = await user.client
      .from("maintenance_records")
      .insert({ token: `test-${Date.now()}`, contact_id: contactId, created_by: user.id, first_name: "Test", last_name: "Contact" })
      .select()
      .single();
    recordId = created!.id;

    const { error } = await user.client.from("maintenance_records").delete().eq("id", recordId);
    // RLS blocks silently (0 rows affected) rather than returning a Postgres error.
    expect(error).toBeNull();
    const admin = createAdminClient();
    const { data: stillThere } = await admin.from("maintenance_records").select("id").eq("id", recordId);
    expect(stillThere).toHaveLength(1);
  });

  it("blocks any authenticated user from updating a record directly (content only changes via the admin client)", async () => {
    ({ contactId, companyId } = await makeContact());
    profileId = await createMaintenanceProfile({ can_view: true, can_add: true, can_delete: true });
    user = await createTestUser("Viewer");
    await assignProfile(user.id, profileId);

    const { data: created } = await user.client
      .from("maintenance_records")
      .insert({ token: `test-${Date.now()}`, contact_id: contactId, created_by: user.id, first_name: "Test", last_name: "Contact" })
      .select()
      .single();
    recordId = created!.id;

    const { data: updated } = await user.client
      .from("maintenance_records")
      .update({ host_name: "should-not-work" })
      .eq("id", recordId)
      .select();

    expect(updated).toEqual([]);
  });
});
