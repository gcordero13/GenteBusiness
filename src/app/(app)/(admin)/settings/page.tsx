import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthConfig } from "@/lib/supabase/managementApi";
import { getPlatformLogoUrl, getLoginBackgroundUrl } from "@/lib/platformSettings";
import { PlatformLogoForm } from "./PlatformLogoForm";
import { LoginBackgroundForm } from "./LoginBackgroundForm";
import { SmtpSettingsForm } from "./SmtpSettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "settings",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  // getAuthConfig() calls the Supabase Management API and throws on any
  // failure (e.g. an expired/invalid access token) — caught here so that
  // failure only disables the SMTP form below, instead of taking down the
  // whole page (including the unrelated logo/background upload forms).
  let config: Record<string, unknown> = {};
  let authConfigError: string | null = null;
  try {
    config = await getAuthConfig();
  } catch (err) {
    authConfigError = err instanceof Error ? err.message : "No se pudo leer la configuración de autenticación";
  }

  const [logoUrl, loginBackgroundUrl] = await Promise.all([getPlatformLogoUrl(), getLoginBackgroundUrl()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <PlatformLogoForm initialLogoUrl={logoUrl} />
      <LoginBackgroundForm initialBackgroundUrl={loginBackgroundUrl} />
      <div>
        <h2 className="text-lg font-semibold">Configuración de correo</h2>
        <p className="text-sm text-muted-foreground">
          Define el servidor de correo (SMTP) que se usa para enviar invitaciones y
          recuperación de clave a los usuarios.
        </p>
      </div>
      {authConfigError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudo cargar la configuración de correo: {authConfigError}. El token de acceso de Supabase
          probablemente expiró — genera uno nuevo y actualízalo en Vercel.
        </p>
      ) : (
        <SmtpSettingsForm
          initial={{
            smtp_host: String(config.smtp_host ?? ""),
            smtp_port: String(config.smtp_port ?? ""),
            smtp_user: String(config.smtp_user ?? ""),
            smtp_sender_name: String(config.smtp_sender_name ?? ""),
            smtp_admin_email: String(config.smtp_admin_email ?? ""),
          }}
        />
      )}
    </div>
  );
}
