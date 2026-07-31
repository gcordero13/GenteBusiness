"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Mirror the same credentials into our own table so the maintenance
  // module's nodemailer transport can read them back — Supabase's Auth
  // config API doesn't expose the password on a GET, only on write.
  const admin = createAdminClient();
  const { error: mirrorError } = await admin
    .from("email_settings")
    .update({
      smtp_host: input.smtp_host,
      smtp_port: Number(input.smtp_port),
      smtp_user: input.smtp_user,
      smtp_pass: input.smtp_pass,
      smtp_sender_name: input.smtp_sender_name,
      smtp_admin_email: input.smtp_admin_email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (mirrorError) {
    return { error: `Configuración guardada en Supabase Auth, pero falló el guardado local: ${mirrorError.message}` };
  }

  revalidatePath("/settings");
  return {};
}

export async function savePlatformLogo(logoUrl: string): Promise<ActionResult> {
  if (!(await callerCanManageSettings())) {
    return { error: "No autorizado" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({ logo_url: logoUrl })
    .eq("id", true);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/login");
  revalidatePath("/forgot-password");
  revalidatePath("/reset-password");
  return {};
}
