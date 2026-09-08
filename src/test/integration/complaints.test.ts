import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("Complaints module", () => {
  let viewer: TestUser | undefined;
  let superAdmin: TestUser | undefined;
  let contactIds: string[] = [];
  let complaintIds: string[] = [];
  let viewerRowIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    for (const id of complaintIds) {
      const { error } = await admin.from("complaints").delete().eq("id", id);
      if (error) console.warn(`failed to delete complaint ${id}: ${error.message}`);
    }
    complaintIds = [];
    for (const id of viewerRowIds) {
      const { error } = await admin.from("complaint_viewers").delete().eq("id", id);
      if (error) console.warn(`failed to delete complaint_viewer ${id}: ${error.message}`);
    }
    viewerRowIds = [];
    for (const id of contactIds) {
      const { error } = await admin.from("contacts").delete().eq("id", id);
      if (error) console.warn(`failed to delete contact ${id}: ${error.message}`);
    }
    contactIds = [];
    if (viewer) await deleteTestUser(viewer.id);
    if (superAdmin) await deleteTestUser(superAdmin.id);
    viewer = undefined;
    superAdmin = undefined;
  });

  it("submit_complaint stores no identifying data when anonymous", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: id, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "otro",
      p_message: "Prueba anónima",
      p_is_anonymous: true,
    });
    expect(error).toBeNull();
    complaintIds.push(id as string);

    const { data: row } = await admin.from("complaints").select("*").eq("id", id).single();
    expect(row?.is_anonymous).toBe(true);
    expect(row?.contact_id).toBeNull();
  });

  it("submit_complaint resolves the caller's own contact_id when not anonymous", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Test", last_name: "User", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: id, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "seguridad",
      p_message: "Prueba con nombre",
      p_is_anonymous: false,
    });
    expect(error).toBeNull();
    complaintIds.push(id as string);

    const { data: row } = await admin.from("complaints").select("*").eq("id", id).single();
    expect(row?.is_anonymous).toBe(false);
    expect(row?.contact_id).toBe(ownContact!.id);
  });

  it("submit_complaint raises when a non-anonymous submitter has no matching contact record", async () => {
    viewer = await createTestUser("Viewer");
    // Deliberately do NOT create a matching contacts row for this viewer.

    const { data, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "otro",
      p_message: "Sin contacto",
      p_is_anonymous: false,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("submit_complaint rejects an invalid category", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "categoria_invalida",
      p_message: "Prueba",
      p_is_anonymous: true,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("a viewer in complaint_viewers can select complaints; a non-viewer sees none", async () => {
    viewer = await createTestUser("Viewer");
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: id } = await superAdmin.client.rpc("submit_complaint", {
      p_category: "etica",
      p_message: "Visible solo para viewers",
      p_is_anonymous: true,
    });
    complaintIds.push(id as string);

    const { data: asNonViewer, error: nonViewerError } = await viewer.client
      .from("complaints")
      .select("id")
      .eq("id", id);
    expect(nonViewerError).toBeNull();
    expect(asNonViewer).toEqual([]);

    const { data: viewerRow } = await admin
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    viewerRowIds.push(viewerRow!.id);

    const { data: asViewer, error: viewerError } = await viewer.client
      .from("complaints")
      .select("id")
      .eq("id", id);
    expect(viewerError).toBeNull();
    expect(asViewer?.map((r: { id: string }) => r.id)).toEqual([id]);
  });

  it("direct insert into complaints is rejected for everyone - only submit_complaint may write", async () => {
    viewer = await createTestUser("Viewer");

    const { error } = await viewer.client
      .from("complaints")
      .insert({ category: "otro", message: "Intento directo", is_anonymous: true });

    expect(error).not.toBeNull();
  });

  it("a can_manage (Super Admin) user can add complaint viewers; a Viewer cannot", async () => {
    superAdmin = await createTestUser("Super Admin");
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: added, error: addError } = await superAdmin.client
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    expect(addError).toBeNull();
    viewerRowIds.push(added!.id);

    const { data: outsider } = await admin.auth.admin.createUser({
      email: `test-outsider-${viewer.id}@example.com`,
      password: "irrelevant-password",
      email_confirm: true,
    });

    const { error: viewerAddError } = await viewer.client
      .from("complaint_viewers")
      .insert({ app_user_id: outsider!.user!.id });
    expect(viewerAddError).not.toBeNull();

    await admin.auth.admin.deleteUser(outsider!.user!.id);
  });
});
