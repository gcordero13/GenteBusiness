import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export function isMaintenanceLinkExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() < now.getTime();
}

export type MaintenanceAccessResult<T> = { ok: true; record: T } | { ok: false; reason: "not_found" | "expired" };

export async function loadMaintenanceRecordByToken<T extends { id: string; status: string; expires_at: string }>(
  token: string,
): Promise<MaintenanceAccessResult<T>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("maintenance_records").select("*").eq("token", token).maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };

  const record = data as T;
  if (record.status === "expirado") return { ok: false, reason: "expired" };
  if (record.status === "pendiente" && isMaintenanceLinkExpired(record.expires_at, new Date())) {
    await admin.from("maintenance_records").update({ status: "expirado" }).eq("id", record.id);
    return { ok: false, reason: "expired" };
  }

  return { ok: true, record };
}
