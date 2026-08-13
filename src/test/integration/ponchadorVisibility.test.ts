import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("Ponchador team/company visibility", () => {
  let viewer: TestUser | undefined;
  let superAdmin: TestUser | undefined;
  let contactIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    // Delete in reverse insertion order: contacts.reports_to_id has a plain
    // (NO ACTION) FK back to contacts.id, and every test pushes a parent
    // before the child that reports to it, so deleting oldest-first throws
    // an FK violation on the still-referenced parent - reversing deletes
    // each child before its parent and avoids leaking rows behind a
    // swallowed error.
    for (const id of [...contactIds].reverse()) {
      await admin.from("contacts").delete().eq("id", id);
    }
    contactIds = [];
    if (viewer) await deleteTestUser(viewer.id);
    if (superAdmin) await deleteTestUser(superAdmin.id);
    viewer = undefined;
    superAdmin = undefined;
  });

  it("lets a user view their own contact's summary", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Viewer", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: ownContact!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Viewer");
  });

  it("lets a user view a direct report's summary", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Lead", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: report } = await admin
      .from("contacts")
      .insert({ first_name: "Direct", last_name: "Report", reports_to_id: ownContact!.id })
      .select()
      .single();
    contactIds.push(report!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: report!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Direct");
  });

  it("lets a user view a report-of-a-report two levels down", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "TopLead", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: middleReport } = await admin
      .from("contacts")
      .insert({ first_name: "Middle", last_name: "Report", reports_to_id: ownContact!.id })
      .select()
      .single();
    contactIds.push(middleReport!.id);

    const { data: deepReport } = await admin
      .from("contacts")
      .insert({ first_name: "Deep", last_name: "Report", reports_to_id: middleReport!.id })
      .select()
      .single();
    contactIds.push(deepReport!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: deepReport!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Deep");
  });

  it("rejects viewing a contact outside the caller's chain without can_manage", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Viewer", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: outsider } = await admin
      .from("contacts")
      .insert({ first_name: "Outsider", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(outsider!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: outsider!.id,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("lets a can_manage user view any contact regardless of hierarchy", async () => {
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    // can_view_ponchador_contact resolves the caller's own contact by email
    // before checking can_manage, so the caller needs a linked contact even
    // though this test is about the can_manage grant, not the self-view.
    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Admin", last_name: "Self", email: superAdmin.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: outsider } = await admin
      .from("contacts")
      .insert({ first_name: "Anyone", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(outsider!.id);

    const { data, error } = await superAdmin.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: outsider!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Anyone");
  });

  it("list_my_ponchador_team returns the full downward chain, not just direct reports", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "TopLead", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: middleReport } = await admin
      .from("contacts")
      .insert({
        first_name: "Middle",
        last_name: "Report",
        reports_to_id: ownContact!.id,
        hikvision_employee_no: `middle-${viewer.id}`,
      })
      .select()
      .single();
    contactIds.push(middleReport!.id);

    const { data: deepReport } = await admin
      .from("contacts")
      .insert({
        first_name: "Deep",
        last_name: "Report",
        reports_to_id: middleReport!.id,
        hikvision_employee_no: `deep-${viewer.id}`,
      })
      .select()
      .single();
    contactIds.push(deepReport!.id);

    const { data, error } = await viewer.client.rpc("list_my_ponchador_team");

    expect(error).toBeNull();
    expect(data?.map((r: { id: string }) => r.id).sort()).toEqual(
      [middleReport!.id, deepReport!.id].sort(),
    );
  });

  it("list_all_ponchador_contacts returns empty for a caller without can_manage", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.rpc("list_all_ponchador_contacts");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("list_all_ponchador_contacts returns contacts for a can_manage caller", async () => {
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: anyone } = await admin
      .from("contacts")
      .insert({
        first_name: "Anyone",
        last_name: "Contact",
        hikvision_employee_no: `anyone-${superAdmin.id}`,
      })
      .select()
      .single();
    contactIds.push(anyone!.id);

    const { data, error } = await superAdmin.client.rpc("list_all_ponchador_contacts");

    expect(error).toBeNull();
    expect(data?.some((r: { id: string }) => r.id === anyone!.id)).toBe(true);
  });
});
