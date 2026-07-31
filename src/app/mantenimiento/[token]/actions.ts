"use server";

import { revalidatePath } from "next/cache";
import { loadMaintenanceRecordByToken } from "@/lib/maintenanceAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { completeMaintenanceRecord, type MaintenanceRecordForCompletion } from "@/lib/completeMaintenanceRecord";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";

interface ActionResult {
  error?: string;
}

export interface MaintenanceProgressInput {
  host_name?: string;
  ram?: string;
  os?: string;
  storage_total?: string;
  storage_used?: string;
  storage_free?: string;
  findings?: string;
  observations?: string;
  restore_point_created?: boolean;
  temp_files_cleaned?: boolean;
  disk_defragmented?: boolean;
  antivirus_updated?: boolean;
  windows_updated?: boolean;
  agenda_installed?: boolean;
  apps_match_profile?: boolean;
  wallpaper_installed?: boolean;
  keyboard_cleaned?: boolean;
  screen_cleaned?: boolean;
}

interface PendingRecordLookup {
  id: string;
  status: string;
  expires_at: string;
}

// Server Actions are reachable via a raw POST to their action-id endpoint,
// not just through the typed client call — a forged request could attach
// extra fields (status, created_by, pdf_path, ...) that aren't in
// MaintenanceProgressInput. Explicitly allowlisting which columns this
// public, token-authenticated action may write closes that gap; the TS
// interface alone is compile-time only and doesn't guard at runtime.
const ALLOWED_PROGRESS_FIELDS = [
  "host_name",
  "ram",
  "os",
  "storage_total",
  "storage_used",
  "storage_free",
  "findings",
  "observations",
  ...MAINTENANCE_CHECKLIST_ITEMS.map((item) => item.key),
] as const satisfies readonly (keyof MaintenanceProgressInput)[];

function pickAllowedProgressFields(input: MaintenanceProgressInput): MaintenanceProgressInput {
  const payload: MaintenanceProgressInput = {};
  for (const key of ALLOWED_PROGRESS_FIELDS) {
    if (key in input) {
      (payload as Record<string, unknown>)[key] = input[key];
    }
  }
  return payload;
}

async function loadPendingRecord(token: string): Promise<{ record: PendingRecordLookup } | { error: string }> {
  const result = await loadMaintenanceRecordByToken<PendingRecordLookup>(token);
  if (!result.ok) return { error: "Enlace inválido o expirado" };
  if (result.record.status === "completado") return { error: "Este mantenimiento ya fue completado" };
  return { record: result.record };
}

export async function saveMaintenanceProgress(
  token: string,
  input: MaintenanceProgressInput,
): Promise<ActionResult> {
  const lookup = await loadPendingRecord(token);
  if ("error" in lookup) return { error: lookup.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("maintenance_records")
    .update(pickAllowedProgressFields(input))
    .eq("id", lookup.record.id);
  if (error) return { error: error.message };

  revalidatePath(`/mantenimiento/${token}`);
  return {};
}

export async function saveMaintenanceSignature(
  token: string,
  role: "technician" | "user",
  dataUrl: string,
): Promise<ActionResult> {
  const result = await loadMaintenanceRecordByToken<
    MaintenanceRecordForCompletion & {
      status: string;
      expires_at: string;
      technician_signature_path: string | null;
      user_signature_path: string | null;
    }
  >(token);
  if (!result.ok) return { error: "Enlace inválido o expirado" };
  if (result.record.status === "completado") return { error: "Este mantenimiento ya fue completado" };

  const base64 = dataUrl.split(",")[1] ?? "";
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { error: "Firma inválida" };

  const admin = createAdminClient();
  const fileName = role === "technician" ? "tecnico.png" : "usuario.png";
  const path = `${result.record.id}/${fileName}`;

  const { error: uploadError } = await admin.storage
    .from("maintenance-signatures")
    .upload(path, bytes, { contentType: "image/png" });
  if (uploadError) return { error: uploadError.message };

  const pathColumn = role === "technician" ? "technician_signature_path" : "user_signature_path";
  const signedAtColumn = role === "technician" ? "technician_signed_at" : "user_signed_at";
  const { error: updateError } = await admin
    .from("maintenance_records")
    .update({ [pathColumn]: path, [signedAtColumn]: new Date().toISOString() })
    .eq("id", result.record.id);
  if (updateError) return { error: updateError.message };

  const otherPathPresent =
    role === "technician" ? Boolean(result.record.user_signature_path) : Boolean(result.record.technician_signature_path);
  if (otherPathPresent) {
    await completeMaintenanceRecord({
      ...result.record,
      technician_signature_path: role === "technician" ? path : (result.record.technician_signature_path as string),
      user_signature_path: role === "user" ? path : (result.record.user_signature_path as string),
    });
  }

  revalidatePath(`/mantenimiento/${token}`);
  return {};
}
