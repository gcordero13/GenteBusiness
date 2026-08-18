import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

// vacation_requests_lock_transitions forbids inserting a row already in a
// decided status (only "pendiente_supervisor" is a legal INSERT value), so
// reaching "aprobado" for a fixture requires walking the same
// supervisor-then-RRHH transition the real workflow uses, mirroring the
// admin-driven transition in vacationRequestsRls.test.ts.
async function insertApprovedVacationRequest(
  admin: ReturnType<typeof createAdminClient>,
  fields: {
    contact_id: string;
    requester_app_user_id: string;
    first_name: string;
    last_name: string;
    supervisor_app_user_id: string;
    tipo?: "vacaciones" | "permiso";
  },
): Promise<string> {
  const { data: created, error: insertError } = await admin
    .from("vacation_requests")
    .insert({
      contact_id: fields.contact_id,
      requester_app_user_id: fields.requester_app_user_id,
      first_name: fields.first_name,
      last_name: fields.last_name,
      days_requested: 2,
      date_from: "2026-08-11",
      date_to: "2026-08-12",
      return_date: "2026-08-13",
      status: "pendiente_supervisor",
      supervisor_app_user_id: fields.supervisor_app_user_id,
      tipo: fields.tipo ?? "vacaciones",
    })
    .select()
    .single();
  if (insertError || !created) {
    throw new Error(`failed to insert vacation request: ${insertError?.message}`);
  }

  const { error: supervisorError } = await admin
    .from("vacation_requests")
    .update({ supervisor_decision: "aprobado", status: "pendiente_rrhh" })
    .eq("id", created.id);
  if (supervisorError) {
    throw new Error(`failed to advance vacation request to pendiente_rrhh: ${supervisorError.message}`);
  }

  const { error: rrhhError } = await admin
    .from("vacation_requests")
    .update({ rrhh_decision: "aprobado", status: "aprobado" })
    .eq("id", created.id);
  if (rrhhError) {
    throw new Error(`failed to advance vacation request to aprobado: ${rrhhError.message}`);
  }

  return created.id as string;
}

describe("Ponchador team/company visibility", () => {
  let viewer: TestUser | undefined;
  let superAdmin: TestUser | undefined;
  let contactIds: string[] = [];
  let deviceId: string | undefined;
  let vacationRequestIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    if (deviceId) {
      const { error: punchesError } = await admin.from("time_clock_punches").delete().eq("device_id", deviceId);
      if (punchesError) {
        console.warn(`failed to delete punches for device ${deviceId}: ${punchesError.message}`);
      }
      const { error: deviceError } = await admin.from("time_clock_devices").delete().eq("id", deviceId);
      if (deviceError) {
        console.warn(`failed to delete device ${deviceId}: ${deviceError.message}`);
      }
    }
    deviceId = undefined;

    for (const id of vacationRequestIds) {
      const { error } = await admin.from("vacation_requests").delete().eq("id", id);
      if (error) {
        console.warn(`failed to delete vacation request ${id}: ${error.message}`);
      }
    }
    vacationRequestIds = [];

    // Delete in reverse insertion order: contacts.reports_to_id has a plain
    // (NO ACTION) FK back to contacts.id, and every test pushes a parent
    // before the child that reports to it, so deleting oldest-first throws
    // an FK violation on the still-referenced parent - reversing deletes
    // each child before its parent and avoids leaking rows behind a
    // swallowed error.
    for (const id of [...contactIds].reverse()) {
      const { error } = await admin.from("contacts").delete().eq("id", id);
      if (error) {
        console.warn(`failed to delete contact ${id}: ${error.message}`);
      }
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
    expect(error?.message).toContain("not authorized");
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

  it("list_my_ponchador_team includes schedule_id and department_id", async () => {
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
      .insert({
        first_name: "Direct",
        last_name: "Report",
        reports_to_id: ownContact!.id,
        hikvision_employee_no: `report-${viewer.id}`,
      })
      .select()
      .single();
    contactIds.push(report!.id);

    const { data, error } = await viewer.client.rpc("list_my_ponchador_team");

    expect(error).toBeNull();
    const row = data?.find((r: { id: string }) => r.id === report!.id);
    expect(row).toBeDefined();
    expect(row.schedule_id).toBeNull();
    expect(row.department_id).toBeNull();
  });

  it("list_all_ponchador_contacts includes schedule_id and department_id", async () => {
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
    const row = data?.find((r: { id: string }) => r.id === anyone!.id);
    expect(row).toBeDefined();
    expect(row.schedule_id).toBeNull();
    expect(row.department_id).toBeNull();
  });

  it("get_ponchador_team_punches returns punches for a downward-chain contact but not an outsider's", async () => {
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

    const { data: outsider } = await admin
      .from("contacts")
      .insert({ first_name: "Outsider", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(outsider!.id);

    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Test Device", ip_address: "192.168.1.1", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    await admin.from("time_clock_punches").insert([
      {
        device_id: deviceId,
        employee_no_string: `report-${viewer.id}`,
        contact_id: report!.id,
        punched_at: "2026-08-11T12:00:00.000Z",
      },
      {
        device_id: deviceId,
        employee_no_string: `outsider-${viewer.id}`,
        contact_id: outsider!.id,
        punched_at: "2026-08-11T13:00:00.000Z",
      },
    ]);

    const { data, error } = await viewer.client.rpc("get_ponchador_team_punches", {
      p_from: "2026-08-11T00:00:00.000Z",
      p_to: "2026-08-12T00:00:00.000Z",
    });

    expect(error).toBeNull();
    const returnedContactIds = data?.map((r: { contact_id: string }) => r.contact_id);
    expect(returnedContactIds).toContain(report!.id);
    expect(returnedContactIds).not.toContain(outsider!.id);
  });

  it("get_ponchador_team_approved_leave returns leave for a downward-chain contact but not an outsider's", async () => {
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

    const { data: outsider } = await admin
      .from("contacts")
      .insert({ first_name: "Outsider", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(outsider!.id);

    const reportLeaveId = await insertApprovedVacationRequest(admin, {
      contact_id: report!.id,
      requester_app_user_id: viewer.id,
      first_name: "Direct",
      last_name: "Report",
      supervisor_app_user_id: viewer.id,
    });
    vacationRequestIds.push(reportLeaveId);

    const outsiderLeaveId = await insertApprovedVacationRequest(admin, {
      contact_id: outsider!.id,
      requester_app_user_id: viewer.id,
      first_name: "Outsider",
      last_name: "Contact",
      supervisor_app_user_id: viewer.id,
    });
    vacationRequestIds.push(outsiderLeaveId);

    const { data, error } = await viewer.client.rpc("get_ponchador_team_approved_leave", {
      p_period_start: "2026-08-01",
      p_period_end: "2026-08-31",
    });

    expect(error).toBeNull();
    const returnedContactIds = data?.map((r: { contact_id: string }) => r.contact_id);
    expect(returnedContactIds).toContain(report!.id);
    expect(returnedContactIds).not.toContain(outsider!.id);
  });

  it("get_ponchador_all_punches returns empty for a non-can_manage caller and rows for a can_manage caller", async () => {
    viewer = await createTestUser("Viewer");

    const { data: emptyData, error: emptyError } = await viewer.client.rpc("get_ponchador_all_punches", {
      p_from: "2026-08-01T00:00:00.000Z",
      p_to: "2026-08-31T00:00:00.000Z",
    });
    expect(emptyError).toBeNull();
    expect(emptyData).toEqual([]);

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

    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Test Device 2", ip_address: "192.168.1.2", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    await admin.from("time_clock_punches").insert({
      device_id: deviceId,
      employee_no_string: `anyone-${superAdmin.id}`,
      contact_id: anyone!.id,
      punched_at: "2026-08-11T12:00:00.000Z",
    });

    const { data, error } = await superAdmin.client.rpc("get_ponchador_all_punches", {
      p_from: "2026-08-11T00:00:00.000Z",
      p_to: "2026-08-12T00:00:00.000Z",
    });

    expect(error).toBeNull();
    expect(data?.some((r: { contact_id: string }) => r.contact_id === anyone!.id)).toBe(true);
  });

  it("get_ponchador_all_approved_leave returns empty for a non-can_manage caller and rows for a can_manage caller", async () => {
    viewer = await createTestUser("Viewer");

    const { data: emptyData, error: emptyError } = await viewer.client.rpc("get_ponchador_all_approved_leave", {
      p_period_start: "2026-08-01",
      p_period_end: "2026-08-31",
    });
    expect(emptyError).toBeNull();
    expect(emptyData).toEqual([]);

    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: anyone } = await admin
      .from("contacts")
      .insert({ first_name: "Anyone", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(anyone!.id);

    const anyoneLeaveId = await insertApprovedVacationRequest(admin, {
      contact_id: anyone!.id,
      requester_app_user_id: superAdmin.id,
      first_name: "Anyone",
      last_name: "Contact",
      supervisor_app_user_id: superAdmin.id,
    });
    vacationRequestIds.push(anyoneLeaveId);

    const { data, error } = await superAdmin.client.rpc("get_ponchador_all_approved_leave", {
      p_period_start: "2026-08-01",
      p_period_end: "2026-08-31",
    });

    expect(error).toBeNull();
    expect(data?.some((r: { contact_id: string }) => r.contact_id === anyone!.id)).toBe(true);
  });

  it("get_ponchador_team_approved_leave returns a vacaciones request's tipo correctly", async () => {
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

    const vacacionesRequestId = await insertApprovedVacationRequest(admin, {
      contact_id: report!.id,
      requester_app_user_id: viewer.id,
      first_name: "Direct",
      last_name: "Report",
      supervisor_app_user_id: viewer.id,
      tipo: "vacaciones",
    });
    vacationRequestIds.push(vacacionesRequestId);

    const { data, error } = await viewer.client.rpc("get_ponchador_team_approved_leave", {
      p_period_start: "2026-08-01",
      p_period_end: "2026-08-31",
    });

    expect(error).toBeNull();
    const row = data?.find((r: { contact_id: string }) => r.contact_id === report!.id);
    expect(row).toBeDefined();
    expect(row?.tipo).toBe("vacaciones");
  });

  it("get_ponchador_all_approved_leave returns a permiso request's tipo correctly", async () => {
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: anyone } = await admin
      .from("contacts")
      .insert({ first_name: "Anyone", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(anyone!.id);

    const permisoRequestId = await insertApprovedVacationRequest(admin, {
      contact_id: anyone!.id,
      requester_app_user_id: superAdmin.id,
      first_name: "Anyone",
      last_name: "Contact",
      supervisor_app_user_id: superAdmin.id,
      tipo: "permiso",
    });
    vacationRequestIds.push(permisoRequestId);

    const { data, error } = await superAdmin.client.rpc("get_ponchador_all_approved_leave", {
      p_period_start: "2026-08-01",
      p_period_end: "2026-08-31",
    });

    expect(error).toBeNull();
    const row = data?.find((r: { contact_id: string }) => r.contact_id === anyone!.id);
    expect(row).toBeDefined();
    expect(row?.tipo).toBe("permiso");
  });
});
