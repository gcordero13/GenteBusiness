import "server-only";
import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBrandedEmailHtml } from "@/lib/emailTemplates";

interface EmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_sender_name: string | null;
  smtp_admin_email: string | null;
}

async function getEmailSettings(): Promise<EmailSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("email_settings").select("*").eq("id", true).single();
  if (error || !data || !data.smtp_host) {
    throw new Error("Configuración SMTP incompleta");
  }
  return data as EmailSettings;
}

// Some networks (this app's own host among them) resolve Office365's SMTP
// hostname to an IPv6 address they then can't route to, failing with
// ENETUNREACH. Resolving to a real IPv4 address ourselves and connecting to
// it directly — while keeping `tls.servername` set to the original hostname
// so certificate validation still matches — sidesteps that entirely instead
// of depending on nodemailer's own IPv4/IPv6 resolution race.
async function resolveConnectHost(host: string): Promise<string> {
  try {
    const { address } = await lookup(host, { family: 4 });
    return address;
  } catch {
    return host;
  }
}

async function buildTransport(settings: EmailSettings) {
  const connectHost = await resolveConnectHost(settings.smtp_host);
  return nodemailer.createTransport({
    host: connectHost,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
    tls: { servername: settings.smtp_host },
  });
}

function fromAddress(settings: EmailSettings): string {
  const name = settings.smtp_sender_name ?? "Gente Sánchez Business";
  const address = settings.smtp_admin_email ?? settings.smtp_user;
  return `${name} <${address}>`;
}

async function fetchPlatformLogoUrl(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("platform_settings").select("logo_url").eq("id", true).maybeSingle();
    return data?.logo_url ?? null;
  } catch {
    return null;
  }
}

// Builds the recovery link and sends it ourselves, instead of Supabase
// Auth's own resetPasswordForEmail: that path depends on the project's
// Site URL / Redirect URLs being configured correctly (recurring source of
// broken links pointing at localhost) and on Supabase's own, heavily
// rate-limited mailer. generateLink only creates the one-time token - no
// email is sent until we send it ourselves below, through the same SMTP
// config (email_settings) every other notification in this app already
// uses, with a link built to match exactly what /auth/confirm expects.
export async function sendPasswordResetEmail(input: { email: string; siteUrl: string }): Promise<void> {
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
  });
  if (linkError) {
    // Never reveal whether an address is registered - a "user not found"
    // error is treated as a silent no-op, same as a successful send.
    if (linkError.message.toLowerCase().includes("not found")) {
      return;
    }
    throw new Error(linkError.message);
  }

  const confirmationUrl = `${input.siteUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=recovery&next=%2Freset-password`;

  const [settings, logoUrl] = await Promise.all([getEmailSettings(), fetchPlatformLogoUrl()]);
  const transport = await buildTransport(settings);
  const html = buildBrandedEmailHtml({
    title: "Restablece tu contraseña",
    bodyHtml: `
      <p style="margin:0 0 14px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en Gente Sánchez Business.</p>
      <p style="margin:0;">Si no fuiste tú, puedes ignorar este correo con tranquilidad — tu contraseña actual seguirá funcionando.</p>
    `,
    ctaText: "Restablecer contraseña",
    ctaUrl: confirmationUrl,
    logoUrl,
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.email,
    subject: "Restablece tu contraseña | Gente Sánchez Business",
    text: `Para restablecer tu contraseña, visita: ${confirmationUrl}`,
    html,
  });
}
