import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("contacts status change requires can_deactivate specifically", () => {
  let editOnly: TestUser | undefined;
  let companyId: string;
  let departmentId: string;
  let contactId: string;
  let editOnlyProfileId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (departmentId) await admin.from("departments").delete().eq("id", departmentId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (editOnly) await deleteTestUser(editOnly.id);
    if (editOnlyProfileId) await admin.from("role_profiles").delete().eq("id", editOnlyProfileId);
    editOnly = undefined;
    contactId = "";
  });

  it("blocks status changes for a profile with can_edit but not can_deactivate", async () => {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("role_profiles")
      .insert({
        name: `Edit Only ${Date.now()}`,
        can_view: true,
        can_add: true,
        can_edit: true,
        can_delete: false,
        can_deactivate: false,
        can_manage_platform: false,
      })
      .select()
      .single();
    editOnlyProfileId = profile!.id;

    const { data: company } = await admin.from("companies").insert({ name: "Status Test Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Status Test Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    editOnly = await createTestUser("Viewer");
    await admin.from("app_users").update({ role_profile_id: editOnlyProfileId }).eq("id", editOnly.id);

    const { data: contact } = await editOnly.client
      .from("contacts")
      .insert({ first_name: "Ana", last_name: "Lopez", company_id: companyId, department_id: departmentId })
      .select()
      .single();
    contactId = contact!.id;

    const { error: editError } = await editOnly.client
      .from("contacts")
      .update({ position: "New Title" })
      .eq("id", contactId);
    expect(editError).toBeNull();

    const { error: statusError } = await editOnly.client
      .from("contacts")
      .update({ status: "deactivated" })
      .eq("id", contactId);
    expect(statusError).not.toBeNull();
  });
});
