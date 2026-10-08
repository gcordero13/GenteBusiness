import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

function baseMantenimientoPayload(requesterId: string, overrides: Record<string, unknown> = {}) {
  return {
    request_type: "mantenimiento",
    requester_app_user_id: requesterId,
    requester_name: "Test Requester",
    ubicacion: "oficina",
    categoria: "mobiliario",
    detalle: "Mesa rota en la sala de juntas",
    status: "recibido",
    ...overrides,
  };
}

describe("goservices_requests RLS", () => {
  let testUsers: TestUser[] = [];
  let requestIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    // goservices_requests rows reference app_users via FK, so they must be
    // deleted before the test users that created/were assigned them.
    for (const id of requestIds) {
      const { error } = await admin.from("goservices_requests").delete().eq("id", id);
      if (error) console.warn(`failed to delete goservices_requests ${id}: ${error.message}`);
    }
    requestIds = [];

    for (const user of testUsers) {
      await deleteTestUser(user.id);
    }
    testUsers = [];
  });

  it("lets a requester insert their own mantenimiento request", async () => {
    const requester = await createTestUser("Viewer");
    testUsers.push(requester);

    const { data, error } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();

    expect(error).toBeNull();
    requestIds.push(data!.id);
    expect(data).toMatchObject({
      request_type: "mantenimiento",
      ubicacion: "oficina",
      categoria: "mobiliario",
      detalle: "Mesa rota en la sala de juntas",
      status: "recibido",
      requester_app_user_id: requester.id,
    });
  });

  it("rejects inserting a request on someone else's behalf", async () => {
    const requester = await createTestUser("Viewer");
    const victim = await createTestUser("Viewer");
    testUsers.push(requester, victim);

    const { data, error } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(victim.id))
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("hides the request from someone with no requester/assignee/can_view relationship to it", async () => {
    const admin = createAdminClient();
    const requester = await createTestUser("Viewer");
    const outsider = await createTestUser("Editor");
    testUsers.push(requester, outsider);

    const { data: created } = await admin
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    const { data, error } = await outsider.client
      .from("goservices_requests")
      .select("*")
      .eq("id", created!.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("lets the requester see their own row but blocks them from updating its status", async () => {
    const requester = await createTestUser("Viewer");
    testUsers.push(requester);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    const { data: readBack, error: readError } = await requester.client
      .from("goservices_requests")
      .select("*")
      .eq("id", created!.id);
    expect(readError).toBeNull();
    expect(readBack).toHaveLength(1);

    // The requester is neither the assignee nor can_view, so the update
    // policy's USING clause excludes this row from the update's target set
    // entirely - no rows match, so the update itself reports no error unless
    // we force PostgREST to demand exactly one affected row back via
    // .select().single(), which surfaces "no rows matched" as a real error
    // (same pattern already used in complaints.test.ts for this RLS shape).
    const { error: updateError } = await requester.client
      .from("goservices_requests")
      .update({ status: "en_proceso" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(updateError).not.toBeNull();

    const admin = createAdminClient();
    const { data: stillRecibido } = await admin
      .from("goservices_requests")
      .select("status, assigned_app_user_id")
      .eq("id", created!.id)
      .single();
    expect(stillRecibido?.status).toBe("recibido");
    expect(stillRecibido?.assigned_app_user_id).toBeNull();
  });

  it("lets a can_view user (Super Admin, the only profile the migration granted can_view on goservices) see and assign the request", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    const assignee = await createTestUser("Viewer");
    testUsers.push(requester, manager, assignee);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    const { data: managerRead, error: managerReadError } = await manager.client
      .from("goservices_requests")
      .select("*")
      .eq("id", created!.id);
    expect(managerReadError).toBeNull();
    expect(managerRead).toHaveLength(1);

    const { data: assigned, error: assignError } = await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: assignee.id })
      .eq("id", created!.id)
      .select()
      .single();
    expect(assignError).toBeNull();
    expect(assigned?.assigned_app_user_id).toBe(assignee.id);
  });

  it("lets the newly assigned user see the request and update its status", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    const assignee = await createTestUser("Viewer");
    testUsers.push(requester, manager, assignee);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    // Assignment has to go through a can_view user's client, not the admin
    // client: the trigger's authorization check is
    // `old.assigned_app_user_id = auth.uid() or can_view`, and the
    // service-role client has no authenticated uid (auth.uid() is null), so
    // get_my_module_permissions resolves to no row and the admin client
    // would itself be rejected by this same trigger.
    const { error: assignError } = await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: assignee.id })
      .eq("id", created!.id)
      .select()
      .single();
    expect(assignError).toBeNull();

    const { data: assigneeRead, error: assigneeReadError } = await assignee.client
      .from("goservices_requests")
      .select("*")
      .eq("id", created!.id);
    expect(assigneeReadError).toBeNull();
    expect(assigneeRead).toHaveLength(1);

    const { data: updated, error: updateError } = await assignee.client
      .from("goservices_requests")
      .update({ status: "en_proceso" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(updateError).toBeNull();
    expect(updated?.status).toBe("en_proceso");
  });

  it("rejects a mantenimiento insert that also sets tipo_mensajeria, via the check constraint", async () => {
    const requester = await createTestUser("Viewer");
    testUsers.push(requester);

    const { data, error } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id, { tipo_mensajeria: "envio" }))
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("locks content columns like detalle forever after creation, even for a can_view user", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    testUsers.push(requester, manager);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    const { error: detalleUpdateError } = await manager.client
      .from("goservices_requests")
      .update({ detalle: "Intentando reescribir el detalle original" })
      .eq("id", created!.id)
      .select()
      .single();

    expect(detalleUpdateError).not.toBeNull();
    expect(detalleUpdateError?.message).toContain(
      "No se pueden modificar los datos de la solicitud luego de creada",
    );

    const admin = createAdminClient();
    const { data: unchanged } = await admin
      .from("goservices_requests")
      .select("detalle")
      .eq("id", created!.id)
      .single();
    expect(unchanged?.detalle).toBe("Mesa rota en la sala de juntas");

    // Status/assigned_app_user_id remain mutable for the same can_view user -
    // confirms the lock is scoped to content columns, not a blanket freeze.
    const { error: statusUpdateError } = await manager.client
      .from("goservices_requests")
      .update({ status: "cancelado" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(statusUpdateError).toBeNull();
  });
});
