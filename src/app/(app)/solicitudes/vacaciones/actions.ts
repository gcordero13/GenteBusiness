"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import {
  sendVacationRequestSubmittedEmail,
  sendVacationRequestSupervisorDecisionEmail,
  sendVacationRequestRrhhDecisionEmail,
} from "@/lib/sendVacationRequestEmail";
import { getSiteUrl } from "@/lib/siteUrl";

interface ActionResult {
  error?: string;
}

export interface CreateVacationRequestInput {
  period: string;
  daysRequested: number;
  dateFrom: string;
  dateTo: string;
  returnDate: string;
  daysPending: number | null;
  notes: string;
}

export async function createVacationRequest(input: CreateVacationRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };

  if (input.daysRequested <= 0) return { error: "La cantidad de días debe ser mayor a cero" };
  if (input.dateTo < input.dateFrom) return { error: "La fecha de fin debe ser posterior o igual a la fecha de inicio" };
  if (input.returnDate < input.dateTo) return { error: "La fecha de regreso debe ser posterior o igual a la fecha de fin" };

  const admin = createAdminClient();
  const resolved = await resolveVacationSupervisor(admin, user.email);
  if (!resolved.ok) return { error: resolved.error };

  const { error } = await supabase
    .from("vacation_requests")
    .insert({
      contact_id: resolved.data.contactId,
      requester_app_user_id: user.id,
      first_name: resolved.data.firstName,
      last_name: resolved.data.lastName,
      position: resolved.data.position,
      company_name: resolved.data.companyName,
      department_name: resolved.data.departmentName,
      period: input.period || null,
      days_requested: input.daysRequested,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      return_date: input.returnDate,
      days_pending: input.daysPending,
      notes: input.notes || null,
      status: "pendiente_supervisor",
      supervisor_app_user_id: resolved.data.supervisorAppUserId,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const { data: supervisor } = await admin.from("app_users").select("email").eq("id", resolved.data.supervisorAppUserId).maybeSingle();
  if (supervisor?.email) {
    const siteUrl = await getSiteUrl();
    try {
      await sendVacationRequestSubmittedEmail({
        supervisorEmail: supervisor.email,
        employeeName: `${resolved.data.firstName} ${resolved.data.lastName}`,
        requestUrl: `${siteUrl}/solicitudes/vacaciones`,
      });
    } catch (err) {
      // The request row is already committed — a mail outage must not
      // block submission. The supervisor can still be notified manually.
      console.error("Failed to send vacation request submitted email:", err);
    }
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}

async function uploadDecisionSignature(
  admin: ReturnType<typeof createAdminClient>,
  requestId: string,
  role: "supervisor" | "rrhh",
  dataUrl: string,
): Promise<{ path?: string; error?: string }> {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { error: "Firma inválida" };

  const path = `${requestId}/${role}.png`;
  const { error } = await admin.storage.from("vacation-request-signatures").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) return { error: error.message };
  return { path };
}

export async function respondAsSupervisor(
  requestId: string,
  decision: "aprobado" | "rechazado",
  signatureDataUrl: string,
  comment: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: request, error: fetchError } = await supabase
    .from("vacation_requests")
    .select("id, status, requester_app_user_id, supervisor_app_user_id, first_name, last_name")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { error: "Solicitud no encontrada" };
  if (request.supervisor_app_user_id !== user.id) return { error: "No autorizado" };
  if (request.status !== "pendiente_supervisor") return { error: "Esta solicitud ya no está pendiente de tu aprobación" };

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    supervisor_decision: decision,
    supervisor_decided_at: new Date().toISOString(),
    supervisor_comments: comment || null,
  };

  if (decision === "aprobado") {
    if (!signatureDataUrl) return { error: "Se requiere una firma para aprobar" };
    const signature = await uploadDecisionSignature(admin, requestId, "supervisor", signatureDataUrl);
    if (signature.error) return { error: signature.error };
    update.supervisor_signature_path = signature.path;
    update.status = "pendiente_rrhh";
  } else {
    update.status = "rechazado";
  }

  const { data: updated, error: updateError } = await supabase.from("vacation_requests").update(update).eq("id", requestId).select();
  if (updateError) return { error: updateError.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  const { data: employee } = await admin.from("app_users").select("email").eq("id", request.requester_app_user_id).maybeSingle();

  // Real lookup of RRHH-authorized users' emails: modules -> role_profile_permissions
  // (filtered to solicitudes_vacaciones + can_authorize) -> app_users (matching
  // role_profile_id, active). app_users has no direct link to a module/permission,
  // so this can't be a single-table query.
  let rrhhEmails: string[] = [];
  if (decision === "aprobado") {
    const { data: module } = await admin.from("modules").select("id").eq("key", "solicitudes_vacaciones").single();
    if (module?.id) {
      const { data: rrhhProfiles } = await admin
        .from("role_profile_permissions")
        .select("role_profile_id")
        .eq("module_id", module.id)
        .eq("can_authorize", true);
      const profileIds = (rrhhProfiles ?? []).map((p: { role_profile_id: string }) => p.role_profile_id);
      if (profileIds.length > 0) {
        const { data: rrhhUsers } = await admin
          .from("app_users")
          .select("email")
          .in("role_profile_id", profileIds)
          .eq("status", "active");
        rrhhEmails = (rrhhUsers ?? []).map((u: { email: string }) => u.email);
      }
    }
  }

  if (employee?.email) {
    try {
      await sendVacationRequestSupervisorDecisionEmail({
        employeeEmail: employee.email,
        employeeName: `${request.first_name} ${request.last_name}`,
        approved: decision === "aprobado",
        requestUrl: `${await getSiteUrl()}/solicitudes/vacaciones`,
        rrhhEmails,
      });
    } catch (err) {
      // The decision is already committed — a mail outage must not block it.
      console.error("Failed to send vacation request supervisor decision email:", err);
    }
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}

export async function respondAsRrhh(
  requestId: string,
  decision: "aprobado" | "rechazado",
  signatureDataUrl: string,
  comment: string,
  classification: { periodConfirmed: string; hasCurrentVacation: boolean; isAdvance: boolean },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "solicitudes_vacaciones",
  });
  if (!flagsRows?.[0]?.can_authorize) return { error: "No autorizado" };

  const { data: request, error: fetchError } = await supabase
    .from("vacation_requests")
    .select("id, status, requester_app_user_id, first_name, last_name")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { error: "Solicitud no encontrada" };
  if (request.status !== "pendiente_rrhh") return { error: "Esta solicitud no está pendiente de RRHH" };

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    rrhh_decision: decision,
    rrhh_decided_at: new Date().toISOString(),
    rrhh_decided_by: user.id,
    rrhh_comments: comment || null,
    rrhh_period_confirmed: classification.periodConfirmed || null,
    rrhh_has_current_vacation: classification.hasCurrentVacation,
    rrhh_is_advance: classification.isAdvance,
    status: decision === "aprobado" ? "aprobado" : "rechazado",
  };

  if (decision === "aprobado") {
    if (!signatureDataUrl) return { error: "Se requiere una firma para aprobar" };
    const signature = await uploadDecisionSignature(admin, requestId, "rrhh", signatureDataUrl);
    if (signature.error) return { error: signature.error };
    update.rrhh_signature_path = signature.path;
  }

  const { data: updated, error: updateError } = await supabase.from("vacation_requests").update(update).eq("id", requestId).select();
  if (updateError) return { error: updateError.message };
  if (!updated || updated.length === 0) return { error: "No autorizado" };

  const { data: employee } = await admin.from("app_users").select("email").eq("id", request.requester_app_user_id).maybeSingle();
  if (employee?.email) {
    try {
      await sendVacationRequestRrhhDecisionEmail({
        employeeEmail: employee.email,
        employeeName: `${request.first_name} ${request.last_name}`,
        approved: decision === "aprobado",
      });
    } catch (err) {
      // Same reasoning as respondAsSupervisor above: the decision is already
      // committed, so a mail outage must not surface as a user-facing error.
      console.error("Failed to send vacation request RRHH decision email:", err);
    }
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}
