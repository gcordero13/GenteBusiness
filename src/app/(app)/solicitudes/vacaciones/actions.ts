"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import { sendVacationRequestSubmittedEmail } from "@/lib/sendVacationRequestEmail";
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
    await sendVacationRequestSubmittedEmail({
      supervisorEmail: supervisor.email,
      employeeName: `${resolved.data.firstName} ${resolved.data.lastName}`,
      requestUrl: `${siteUrl}/solicitudes/vacaciones`,
    });
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}
