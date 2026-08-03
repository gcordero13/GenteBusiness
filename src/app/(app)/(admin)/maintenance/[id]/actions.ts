"use server";

import { createClient } from "@/lib/supabase/server";
import { sendMaintenanceLinkEmail } from "@/lib/sendMaintenanceEmail";
import { getSiteUrl } from "@/lib/siteUrl";

interface ActionResult {
  error?: string;
}

export async function sendMaintenanceLinkByEmail(recordId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_add) {
    return { error: "No autorizado" };
  }

  const { data: record, error } = await supabase
    .from("maintenance_records")
    .select("token, email, first_name, last_name, status")
    .eq("id", recordId)
    .single();
  if (error || !record) return { error: "Mantenimiento no encontrado" };
  if (!record.email) return { error: "El contacto no tiene un correo registrado" };

  const siteUrl = await getSiteUrl();

  try {
    await sendMaintenanceLinkEmail({
      userEmail: record.email,
      userName: `${record.first_name} ${record.last_name}`,
      linkUrl: `${siteUrl}/mantenimiento/${record.token}`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al enviar el correo" };
  }

  return {};
}
