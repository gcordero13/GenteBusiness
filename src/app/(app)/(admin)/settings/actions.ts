"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateAuthConfig } from "@/lib/supabase/managementApi";

export interface SaveSmtpSettingsInput {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_sender_name: string;
  smtp_admin_email: string;
}

interface ActionResult {
  error?: string;
}

async function callerCanManageSettings(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "settings" });
  return Boolean(data?.[0]?.can_manage);
}

export async function saveSmtpSettings(input: SaveSmtpSettingsInput): Promise<ActionResult> {
  if (!(await callerCanManageSettings())) {
    return { error: "No autorizado" };
  }

  try {
    await updateAuthConfig({
      smtp_host: input.smtp_host,
      smtp_port: input.smtp_port,
      smtp_user: input.smtp_user,
      smtp_pass: input.smtp_pass,
      smtp_sender_name: input.smtp_sender_name,
      smtp_admin_email: input.smtp_admin_email,
      // Supabase's default email rate limit (2/hour) is meant for the
      // built-in test mailer; raise it now that real SMTP is configured.
      rate_limit_email_sent: 30,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo guardar la configuración" };
  }

  revalidatePath("/settings");
  return {};
}
