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

  it("direct update/delete against complaints is rejected for everyone - only submit_complaint may write", async () => {
    viewer = await createTestUser("Viewer");

    const { data: id, error: submitError } = await viewer.client.rpc("submit_complaint", {
      p_category: "otro",
      p_message: "Prueba para bypass directo",
      p_is_anonymous: true,
    });
    expect(submitError).toBeNull();
    complaintIds.push(id as string);

    // RLS defines no update/delete policy at all for `complaints`, so a
    // direct mutation simply matches zero (invisible) rows rather than
    // raising an error on its own. Chaining .select().single() forces
    // PostgREST to demand exactly one affected row back, which surfaces
    // that "no rows matched" as an actual error we can assert on.
    const { error: updateError } = await viewer.client
      .from("complaints")
      .update({ message: "Intento de edición directa" })
      .eq("id", id)
      .select()
      .single();
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await viewer.client
      .from("complaints")
      .delete()
      .eq("id", id)
      .select()
      .single();
    expect(deleteError).not.toBeNull();
  });

  it("a can_manage (Super Admin) user can add complaint viewers; a Viewer cannot", async () => {
    superAdmin = await createTestUser("Super Admin");
    viewer = await createTestUser("Viewer");

    const { data: added, error: addError } = await superAdmin.client
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    expect(addError).toBeNull();
    viewerRowIds.push(added!.id);

    // Reuse superAdmin.id as the insert target - the Viewer client only needs
    // *some* valid app_users.id to attempt this insert against, it doesn't
    // need a genuinely distinct third identity.
    const { data: viewerAdded, error: viewerAddError } = await viewer.client
      .from("complaint_viewers")
      .insert({ app_user_id: superAdmin.id })
      .select()
      .single();
    expect(viewerAddError).not.toBeNull();
    // If the insert unexpectedly succeeded (i.e. the RLS bug this test
    // guards against is real), make sure the row still gets cleaned up.
    if (viewerAdded) viewerRowIds.push(viewerAdded.id);
  });

  it("a can_manage (Super Admin) user can remove complaint viewers; a Viewer cannot", async () => {
    superAdmin = await createTestUser("Super Admin");
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: removableRow } = await admin
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    viewerRowIds.push(removableRow!.id);

    const { error: removeError } = await superAdmin.client
      .from("complaint_viewers")
      .delete()
      .eq("id", removableRow!.id);
    expect(removeError).toBeNull();

    const { data: afterRemoval } = await admin
      .from("complaint_viewers")
      .select("id")
      .eq("id", removableRow!.id);
    expect(afterRemoval).toEqual([]);

    // Row belongs to a different app_user (superAdmin) than the one attempting
    // the delete, so this covers "removing someone else's viewer grant".
    const { data: someoneElsesRow } = await admin
      .from("complaint_viewers")
      .insert({ app_user_id: superAdmin.id })
      .select()
      .single();
    viewerRowIds.push(someoneElsesRow!.id);

    // As above, a filtered (not can_manage) delete matches zero rows rather
    // than erroring on its own - .select().single() forces that "no rows
    // matched" into a visible error.
    const { error: viewerRemoveError } = await viewer.client
      .from("complaint_viewers")
      .delete()
      .eq("id", someoneElsesRow!.id)
      .select()
      .single();
    expect(viewerRemoveError).not.toBeNull();
  });
});
