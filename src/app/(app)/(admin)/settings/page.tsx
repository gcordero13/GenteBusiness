import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfig } from "@/lib/supabase/managementApi";
import { SmtpSettingsForm } from "./SmtpSettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "settings",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const config = await getAuthConfig();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Configuración de correo</h1>
        <p className="text-sm text-muted-foreground">
          Define el servidor de correo (SMTP) que se usa para enviar invitaciones y
          recuperación de clave a los usuarios.
        </p>
      </div>
      <SmtpSettingsForm
        initial={{
          smtp_host: String(config.smtp_host ?? ""),
          smtp_port: String(config.smtp_port ?? ""),
          smtp_user: String(config.smtp_user ?? ""),
          smtp_sender_name: String(config.smtp_sender_name ?? ""),
          smtp_admin_email: String(config.smtp_admin_email ?? ""),
        }}
      />
    </div>
  );
}
