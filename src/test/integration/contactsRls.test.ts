import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function makeCompanyAndDepartment() {
  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .insert({ name: "RLS Test Co" })
    .select()
    .single();
  const { data: department } = await admin
    .from("departments")
    .insert({ name: "RLS Test Dept", company_id: company!.id })
    .select()
    .single();
  return { companyId: company!.id as string, departmentId: department!.id as string };
}

describe("contacts RLS", () => {
  let viewer: TestUser | undefined;
  let editor: TestUser | undefined;
  let companyId: string;
  let departmentId: string;
  let contactId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (departmentId) await admin.from("departments").delete().eq("id", departmentId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (viewer) await deleteTestUser(viewer.id);
    if (editor) await deleteTestUser(editor.id);
    viewer = undefined;
    editor = undefined;
    contactId = "";
  });

  it("lets a Viewer read contacts but not insert one", async () => {
    ({ companyId, departmentId } = await makeCompanyAndDepartment());
    viewer = await createTestUser("Viewer");

    const { error: readError } = await viewer.client.from("contacts").select("*");
    expect(readError).toBeNull();

    const { error: insertError } = await viewer.client.from("contacts").insert({
      first_name: "Ana",
      last_name: "Lopez",
      company_id: companyId,
      department_id: departmentId,
    });
    expect(insertError).not.toBeNull();
  });

  it("lets an Editor insert a contact and edit non-status fields, but not change status", async () => {
    ({ companyId, departmentId } = await makeCompanyAndDepartment());
    editor = await createTestUser("Editor");

    const { data: inserted, error: insertError } = await editor.client
      .from("contacts")
      .insert({
        first_name: "Ana",
        last_name: "Lopez",
        company_id: companyId,
        department_id: departmentId,
        status: "active",
      })
      .select()
      .single();
    expect(insertError).toBeNull();
    contactId = inserted!.id;

    const { error: editError } = await editor.client
      .from("contacts")
      .update({ position: "Supervisor" })
      .eq("id", contactId);
    expect(editError).toBeNull();
  });
});
