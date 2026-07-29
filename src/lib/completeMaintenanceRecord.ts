import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMaintenancePdfBytes, formatDateForFilename } from "@/lib/maintenancePdfReport";
import { sendMaintenanceReportEmail, sendSurveyEmail } from "@/lib/sendMaintenanceEmail";
import { generateMaintenanceToken } from "@/lib/maintenanceToken";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";
import { getSiteUrl } from "@/lib/siteUrl";

export interface MaintenanceRecordForCompletion {
  id: string;
  created_by: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company_name: string | null;
  department_name: string | null;
  email: string | null;
  host_name: string | null;
  ram: string | null;
  os: string | null;
  storage_total: string | null;
  storage_used: string | null;
  storage_free: string | null;
  findings: string | null;
  observations: string | null;
  technician_signature_path: string;
  user_signature_path: string;
  [checklistKey: string]: unknown;
}

async function downloadSignature(admin: ReturnType<typeof createAdminClient>, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from("maintenance-signatures").download(path);
  if (error || !data) throw new Error(`No se pudo leer la firma en ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function completeMaintenanceRecord(record: MaintenanceRecordForCompletion): Promise<void> {
  const admin = createAdminClient();
  const completedAt = new Date();

  const [technicianPng, userPng] = await Promise.all([
    downloadSignature(admin, record.technician_signature_path),
    downloadSignature(admin, record.user_signature_path),
  ]);

  // Generation failures throw here and intentionally leave the record
  // untouched — status stays "pendiente" so the caller can retry without
  // losing already-saved signatures/data.
  const pdfBytes = await buildMaintenancePdfBytes(
    {
      firstName: record.first_name,
      lastName: record.last_name,
      position: record.position,
      companyName: record.company_name,
      departmentName: record.department_name,
      email: record.email,
      hostName: record.host_name,
      ram: record.ram,
      os: record.os,
      storageTotal: record.storage_total,
      storageUsed: record.storage_used,
      storageFree: record.storage_free,
      checklist: MAINTENANCE_CHECKLIST_ITEMS.map((item) => ({
        label: item.label,
        value: (record[item.key] as boolean | null) ?? null,
      })),
      findings: record.findings,
      observations: record.observations,
      completedAt,
    },
    { technicianPng, userPng },
  );

  const pdfPath = `${record.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from("maintenance-reports")
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf" });
  if (uploadError) throw new Error(uploadError.message);

  const surveyToken = generateMaintenanceToken();
  const { error: surveyError } = await admin.from("maintenance_surveys").insert({
    maintenance_record_id: record.id,
    technician_id: record.created_by,
    token: surveyToken,
  });
  if (surveyError) throw new Error(surveyError.message);

  const userName = `${record.first_name} ${record.last_name}`;
  const completedDate = formatDateForFilename(completedAt);
  const siteUrl = await getSiteUrl();

  let emailError: string | null = null;
  try {
    await sendMaintenanceReportEmail({ userName, completedDate, pdfBytes });
    if (record.email) {
      await sendSurveyEmail({
        userEmail: record.email,
        userName: record.first_name,
        surveyUrl: `${siteUrl}/encuesta/${surveyToken}`,
      });
    }
  } catch (err) {
    // Signatures and the PDF are already valid and saved — a mail outage
    // must not block completion. Surface the error for a manual resend.
    emailError = err instanceof Error ? err.message : "Error al enviar el correo";
  }

  const { error: updateError } = await admin
    .from("maintenance_records")
    .update({
      status: "completado",
      pdf_path: pdfPath,
      completed_at: completedAt.toISOString(),
      email_error: emailError,
    })
    .eq("id", record.id);
  if (updateError) throw new Error(updateError.message);
}
