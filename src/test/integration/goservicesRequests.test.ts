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

function baseMensajeriaPayload(requesterId: string, overrides: Record<string, unknown> = {}) {
  return {
    request_type: "mensajeria",
    requester_app_user_id: requesterId,
    requester_name: "Test Requester",
    tipo_mensajeria: "envio",
    detalle: "Enviar documentos a la sucursal norte",
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

  it("lets an assigned mantenimiento ejecutor progress en_proceso -> finalizado_ejecutor, but blocks them from jumping to completado or cancelado", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    const ejecutor = await createTestUser("Viewer");
    testUsers.push(requester, manager, ejecutor);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    const { error: assignError } = await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: ejecutor.id })
      .eq("id", created!.id)
      .select()
      .single();
    expect(assignError).toBeNull();

    // 1. Assigned ejecutor can set en_proceso.
    const { data: enProceso, error: enProcesoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "en_proceso" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(enProcesoError).toBeNull();
    expect(enProceso?.status).toBe("en_proceso");

    // 2. Same ejecutor can then set finalizado_ejecutor.
    const { data: finalizado, error: finalizadoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "finalizado_ejecutor" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(finalizadoError).toBeNull();
    expect(finalizado?.status).toBe("finalizado_ejecutor");

    // 3. Same ejecutor cannot jump straight to completado - real Postgres
    // exception from the trigger, not just an RLS-filtered no-op.
    const { error: completadoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "completado" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(completadoError).not.toBeNull();
    expect(completadoError?.message).toContain("Un ejecutor de mantenimiento solo puede marcar");

    // 4. Same ejecutor cannot cancel either.
    const { error: canceladoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "cancelado" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(canceladoError).not.toBeNull();
    expect(canceladoError?.message).toContain("Un ejecutor de mantenimiento solo puede marcar");

    const admin = createAdminClient();
    const { data: stillFinalizado } = await admin
      .from("goservices_requests")
      .select("status")
      .eq("id", created!.id)
      .single();
    expect(stillFinalizado?.status).toBe("finalizado_ejecutor");
  });

  it("lets a gestor close a finalizado_ejecutor mantenimiento request as completado", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    const ejecutor = await createTestUser("Viewer");
    testUsers.push(requester, manager, ejecutor);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: ejecutor.id })
      .eq("id", created!.id)
      .select()
      .single();

    const { error: finalizadoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "finalizado_ejecutor" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(finalizadoError).toBeNull();

    const { data: completado, error: completadoError } = await manager.client
      .from("goservices_requests")
      .update({ status: "completado" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(completadoError).toBeNull();
    expect(completado?.status).toBe("completado");
  });

  it("lets a gestor cancel any request directly, regardless of request_type or current status", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    testUsers.push(requester, manager);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    const { data: cancelado, error: canceladoError } = await manager.client
      .from("goservices_requests")
      .update({ status: "cancelado" })
      .eq("id", created!.id)
      .select()
      .single();
    expect(canceladoError).toBeNull();
    expect(cancelado?.status).toBe("cancelado");
  });

  it("lets an assigned mensajeria ejecutor complete a request directly (no finalizado_ejecutor step), but blocks finalizado_ejecutor and cancelado", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    const ejecutor = await createTestUser("Viewer");
    testUsers.push(requester, manager, ejecutor);

    const { data: completable } = await requester.client
      .from("goservices_requests")
      .insert(baseMensajeriaPayload(requester.id))
      .select()
      .single();
    requestIds.push(completable!.id);

    await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: ejecutor.id })
      .eq("id", completable!.id)
      .select()
      .single();

    // 7. Direct recibido -> completado, no intermediate step required.
    const { data: completed, error: completeError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "completado" })
      .eq("id", completable!.id)
      .select()
      .single();
    expect(completeError).toBeNull();
    expect(completed?.status).toBe("completado");

    const { data: restricted } = await requester.client
      .from("goservices_requests")
      .insert(baseMensajeriaPayload(requester.id))
      .select()
      .single();
    requestIds.push(restricted!.id);

    await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: ejecutor.id })
      .eq("id", restricted!.id)
      .select()
      .single();

    // 8. finalizado_ejecutor is mantenimiento-only.
    const { error: finalizadoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "finalizado_ejecutor" })
      .eq("id", restricted!.id)
      .select()
      .single();
    expect(finalizadoError).not.toBeNull();
    expect(finalizadoError?.message).toContain("Un mensajero solo puede marcar");

    // 9. cancelado is still gestor-only for mensajeria.
    const { error: canceladoError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "cancelado" })
      .eq("id", restricted!.id)
      .select()
      .single();
    expect(canceladoError).not.toBeNull();
    expect(canceladoError?.message).toContain("Un mensajero solo puede marcar");

    const admin = createAdminClient();
    const { data: stillRecibido } = await admin
      .from("goservices_requests")
      .select("status")
      .eq("id", restricted!.id)
      .single();
    expect(stillRecibido?.status).toBe("recibido");
  });

  it("rejects an assigned ejecutor who tries to reassign the ticket in the same update that changes status", async () => {
    const requester = await createTestUser("Viewer");
    const manager = await createTestUser("Super Admin");
    const ejecutor = await createTestUser("Viewer");
    const otherEjecutor = await createTestUser("Viewer");
    testUsers.push(requester, manager, ejecutor, otherEjecutor);

    const { data: created } = await requester.client
      .from("goservices_requests")
      .insert(baseMantenimientoPayload(requester.id))
      .select()
      .single();
    requestIds.push(created!.id);

    await manager.client
      .from("goservices_requests")
      .update({ assigned_app_user_id: ejecutor.id })
      .eq("id", created!.id)
      .select()
      .single();

    // Only a gestor may reassign - bundling a status change with a
    // reassignment attempt must be rejected even though the status change
    // alone would have been allowed.
    const { error: reassignError } = await ejecutor.client
      .from("goservices_requests")
      .update({ status: "en_proceso", assigned_app_user_id: otherEjecutor.id })
      .eq("id", created!.id)
      .select()
      .single();
    expect(reassignError).not.toBeNull();
    expect(reassignError?.message).toContain(
      "No autorizado para cambiar el estado o la asignación de la solicitud",
    );

    const admin = createAdminClient();
    const { data: unchanged } = await admin
      .from("goservices_requests")
      .select("status, assigned_app_user_id")
      .eq("id", created!.id)
      .single();
    expect(unchanged?.status).toBe("recibido");
    expect(unchanged?.assigned_app_user_id).toBe(ejecutor.id);
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
