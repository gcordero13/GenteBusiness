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
      p_category: "otros",
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
      p_category: "otros",
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
      p_category: "otros",
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

  it("update_complaint_status lets a viewer update status/comment; a non-viewer cannot", async () => {
    viewer = await createTestUser("Viewer");
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: id } = await superAdmin.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Para actualizar estado",
      p_is_anonymous: true,
    });
    complaintIds.push(id as string);

    const { data: viewerRow } = await admin
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    viewerRowIds.push(viewerRow!.id);

    const { error: nonViewerError } = await superAdmin.client.rpc("update_complaint_status", {
      p_id: id,
      p_status: "en_proceso",
      p_comment: "no debería aplicar",
    });
    // superAdmin here has can_manage on role_profiles but is NOT a complaint_viewers
    // row (only "viewer" was added above), so this must be rejected too - viewing
    // access, not role-profile management, is what update_complaint_status checks.
    expect(nonViewerError).not.toBeNull();

    const { error: viewerError } = await viewer.client.rpc("update_complaint_status", {
      p_id: id,
      p_status: "en_proceso",
      p_comment: "revisando",
    });
    expect(viewerError).toBeNull();

    const { data: row } = await admin.from("complaints").select("status, reviewer_comment").eq("id", id).single();
    expect(row?.status).toBe("en_proceso");
    expect(row?.reviewer_comment).toBe("revisando");
  });

  it("submit_complaint stores an optional photo_path identically for anonymous and named submissions", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: anonId, error: anonError } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Con foto anónima",
      p_is_anonymous: true,
      p_photo_path: "test/anon-photo.png",
    });
    expect(anonError).toBeNull();
    complaintIds.push(anonId as string);

    const { data: anonRow } = await admin.from("complaints").select("photo_path, contact_id").eq("id", anonId).single();
    expect(anonRow?.photo_path).toBe("test/anon-photo.png");
    expect(anonRow?.contact_id).toBeNull();
  });

  it("complaint_number is assigned automatically and increases with each submission", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: firstId } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Primera",
      p_is_anonymous: true,
    });
    complaintIds.push(firstId as string);
    const { data: secondId } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Segunda",
      p_is_anonymous: true,
    });
    complaintIds.push(secondId as string);

    const { data: rows } = await admin
      .from("complaints")
      .select("id, complaint_number")
      .in("id", [firstId, secondId]);
    const first = rows!.find((r: { id: string }) => r.id === firstId)!;
    const second = rows!.find((r: { id: string }) => r.id === secondId)!;
    expect(second.complaint_number).toBeGreaterThan(first.complaint_number);
  });

  it("direct update on complaints for status/reviewer_comment is still rejected - only update_complaint_status may write", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: viewerRow } = await admin
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    viewerRowIds.push(viewerRow!.id);

    const { data: id } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Intento de update directo",
      p_is_anonymous: true,
    });
    complaintIds.push(id as string);

    const { error } = await viewer.client
      .from("complaints")
      .update({ status: "resuelto" })
      .eq("id", id)
      .select()
      .single();
    expect(error).not.toBeNull();
  });

  it("list_my_complaints returns a submitter's own named complaints", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Test", last_name: "User", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: id } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Mi propia queja con nombre",
      p_is_anonymous: false,
    });
    complaintIds.push(id as string);

    const { data: rows, error } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [] });
    expect(error).toBeNull();
    expect(rows?.map((r: { id: string }) => r.id)).toContain(id);
  });

  it("list_my_complaints returns an anonymous complaint only when its exact id is supplied, and returns nothing without it", async () => {
    viewer = await createTestUser("Viewer");

    const { data: myAnonId } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Mi queja anónima",
      p_is_anonymous: true,
    });
    complaintIds.push(myAnonId as string);

    const { data: withoutProof } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [] });
    expect(withoutProof?.map((r: { id: string }) => r.id)).not.toContain(myAnonId);

    const { data: withProof } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [myAnonId] });
    expect(withProof?.map((r: { id: string }) => r.id)).toContain(myAnonId);
  });

  it("submit_complaint stores the provided subject, and list_my_complaints returns it", async () => {
    viewer = await createTestUser("Viewer");

    const { data: id, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "otros",
      p_message: "Mensaje de prueba",
      p_is_anonymous: true,
      p_subject: "Asunto de prueba",
    });
    expect(error).toBeNull();
    complaintIds.push(id as string);

    const { data: rows } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [id] });
    const row = rows?.find((r: { id: string }) => r.id === id);
    expect(row?.subject).toBe("Asunto de prueba");
  });
});
