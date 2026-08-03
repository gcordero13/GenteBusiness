import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function makeContactPair(supervisorEmail: string, employeeEmail: string) {
  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").insert({ name: "Vacation Test Co" }).select().single();
  const { data: supervisorContact } = await admin
    .from("contacts")
    .insert({ first_name: "Sup", last_name: "Ervisor", email: supervisorEmail, company_id: company!.id })
    .select()
    .single();
  const { data: employeeContact } = await admin
    .from("contacts")
    .insert({
      first_name: "Emp",
      last_name: "Loyee",
      email: employeeEmail,
      company_id: company!.id,
      reports_to_id: supervisorContact!.id,
    })
    .select()
    .single();
  return { companyId: company!.id as string, supervisorContactId: supervisorContact!.id as string, employeeContactId: employeeContact!.id as string };
}

describe("vacation_requests RLS", () => {
  let employee: TestUser | undefined;
  let supervisor: TestUser | undefined;
  let outsider: TestUser | undefined;
  let companyId = "";
  let employeeContactId = "";
  let supervisorContactId = "";
  let requestId = "";

  afterEach(async () => {
    const admin = createAdminClient();
    if (requestId) await admin.from("vacation_requests").delete().eq("id", requestId);
    if (employeeContactId) await admin.from("contacts").delete().eq("id", employeeContactId);
    if (supervisorContactId) await admin.from("contacts").delete().eq("id", supervisorContactId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (employee) await deleteTestUser(employee.id);
    if (supervisor) await deleteTestUser(supervisor.id);
    if (outsider) await deleteTestUser(outsider.id);
    employee = undefined;
    supervisor = undefined;
    outsider = undefined;
    companyId = "";
    employeeContactId = "";
    supervisorContactId = "";
    requestId = "";
  });

  it("lets an employee with zero module permissions create and read their own request", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const { data, error } = await employee.client
      .from("vacation_requests")
      .insert({
        contact_id: employeeContactId,
        requester_app_user_id: employee.id,
        first_name: "Emp",
        last_name: "Loyee",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
        status: "pendiente_supervisor",
        supervisor_app_user_id: supervisor.id,
      })
      .select()
      .single();

    expect(error).toBeNull();
    requestId = data!.id;

    const { data: readBack } = await employee.client.from("vacation_requests").select("*").eq("id", requestId);
    expect(readBack).toHaveLength(1);
  });

  it("blocks inserting a request on someone else's behalf", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    outsider = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const { error } = await outsider.client.from("vacation_requests").insert({
      contact_id: employeeContactId,
      requester_app_user_id: employee.id,
      first_name: "Emp",
      last_name: "Loyee",
      days_requested: 2,
      date_from: "2026-11-13",
      date_to: "2026-11-14",
      return_date: "2026-11-17",
      status: "pendiente_supervisor",
      supervisor_app_user_id: supervisor.id,
    });

    expect(error).not.toBeNull();
  });

  it("lets the resolved supervisor read and update a pendiente_supervisor request, but not an outsider", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    outsider = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const admin = createAdminClient();
    const { data: created } = await admin
      .from("vacation_requests")
      .insert({
        contact_id: employeeContactId,
        requester_app_user_id: employee.id,
        first_name: "Emp",
        last_name: "Loyee",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
        status: "pendiente_supervisor",
        supervisor_app_user_id: supervisor.id,
      })
      .select()
      .single();
    requestId = created!.id;

    const { data: outsiderRead } = await outsider.client.from("vacation_requests").select("*").eq("id", requestId);
    expect(outsiderRead).toEqual([]);

    const { error: outsiderUpdateError, data: outsiderUpdateData } = await supervisor.client
      .from("vacation_requests")
      .update({ supervisor_decision: "aprobado", status: "pendiente_rrhh" })
      .eq("id", requestId)
      .select();
    expect(outsiderUpdateError).toBeNull();
    expect(outsiderUpdateData).toHaveLength(1);
  });

  it("blocks the supervisor from updating once the request has moved to pendiente_rrhh", async () => {
    employee = await createTestUser("Viewer");
    supervisor = await createTestUser("Viewer");
    ({ companyId, supervisorContactId, employeeContactId } = await makeContactPair(supervisor.email, employee.email));

    const admin = createAdminClient();
    const { data: created } = await admin
      .from("vacation_requests")
      .insert({
        contact_id: employeeContactId,
        requester_app_user_id: employee.id,
        first_name: "Emp",
        last_name: "Loyee",
        days_requested: 2,
        date_from: "2026-11-13",
        date_to: "2026-11-14",
        return_date: "2026-11-17",
        status: "pendiente_supervisor",
        supervisor_app_user_id: supervisor.id,
      })
      .select()
      .single();
    requestId = created!.id;

    // Move the request past the supervisor stage the same way the real
    // workflow does (status + supervisor_decision together, enforced by the
    // vacation_requests_lock_transitions trigger) before testing that the
    // supervisor can no longer touch it.
    await admin
      .from("vacation_requests")
      .update({ supervisor_decision: "aprobado", status: "pendiente_rrhh" })
      .eq("id", requestId);

    const { data: updated } = await supervisor.client
      .from("vacation_requests")
      .update({ supervisor_comments: "intentando editar tarde" })
      .eq("id", requestId)
      .select();
    expect(updated).toEqual([]);
  });
});
