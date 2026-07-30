import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("contacts self-edit", () => {
  let viewer: TestUser | undefined;
  let companyId = "";
  let departmentId = "";
  let contactId = "";
  let extraProfileId = "";

  afterEach(async () => {
    const admin = createAdminClient();
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (departmentId) await admin.from("departments").delete().eq("id", departmentId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (viewer) await deleteTestUser(viewer.id);
    if (extraProfileId) await admin.from("role_profiles").delete().eq("id", extraProfileId);
    viewer = undefined;
    companyId = "";
    departmentId = "";
    contactId = "";
    extraProfileId = "";
  });

  it("lets a Viewer (no can_edit) update position/extension/fleet_phone/has_whatsapp on their OWN contact", async () => {
    const admin = createAdminClient();
    viewer = await createTestUser("Viewer");

    const { data: company } = await admin.from("companies").insert({ name: "Self Edit Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Self Edit Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "Self",
        last_name: "Edit",
        email: viewer.email,
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { error } = await viewer.client
      .from("contacts")
      .update({ position: "Nuevo puesto", fleet_phone: "5551234", extension: "101", has_whatsapp: true })
      .eq("id", contactId);

    expect(error).toBeNull();
  });

  it("blocks a Viewer from editing OTHER fields on their own contact", async () => {
    const admin = createAdminClient();
    viewer = await createTestUser("Viewer");

    const { data: company } = await admin.from("companies").insert({ name: "Self Edit Co 2" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Self Edit Dept 2", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "Self",
        last_name: "Edit",
        email: viewer.email,
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { error } = await viewer.client.from("contacts").update({ first_name: "Hacked" }).eq("id", contactId);

    expect(error).not.toBeNull();
  });

  it("blocks a Viewer from editing someone else's contact, even changing only position", async () => {
    const admin = createAdminClient();
    viewer = await createTestUser("Viewer");

    const { data: company } = await admin.from("companies").insert({ name: "Self Edit Co 3" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Self Edit Dept 3", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "Someone",
        last_name: "Else",
        email: "not-the-viewer@example.com",
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { error } = await viewer.client.from("contacts").update({ position: "Should fail" }).eq("id", contactId);

    expect(error).not.toBeNull();
  });

  it("lets a user with NO contacts permissions still SELECT and self-edit their own contact", async () => {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("role_profiles")
      .insert({ name: `No Access ${Date.now()}` })
      .select()
      .single();
    extraProfileId = profile!.id;

    const { data: contactsModule } = await admin.from("modules").select("id").eq("key", "contacts").single();

    await admin.from("role_profile_permissions").insert({
      role_profile_id: extraProfileId,
      module_id: contactsModule!.id,
      can_view: false,
      can_add: false,
      can_edit: false,
      can_delete: false,
      can_deactivate: false,
      can_manage: false,
      can_authorize: false,
    });

    viewer = await createTestUser("Viewer");
    await admin.from("app_users").update({ role_profile_id: extraProfileId }).eq("id", viewer.id);

    const { data: company } = await admin.from("companies").insert({ name: "No Access Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "No Access Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "No",
        last_name: "Access",
        email: viewer.email,
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { data: selected, error: selectError } = await viewer.client
      .from("contacts")
      .select("*")
      .eq("id", contactId);
    expect(selectError).toBeNull();
    expect(selected).toHaveLength(1);

    const { error: updateError } = await viewer.client
      .from("contacts")
      .update({ position: "My own title" })
      .eq("id", contactId);
    expect(updateError).toBeNull();
  });
});
