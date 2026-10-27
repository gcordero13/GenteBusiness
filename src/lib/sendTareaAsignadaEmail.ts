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
// it directly - while keeping `tls.servername` set to the original hostname
// so certificate validation still matches - sidesteps that entirely instead
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

export async function sendTareaAsignadaEmail(input: {
  assigneeEmail: string;
  assigneeName: string;
  tareaTitle: string;
  proyectoName: string;
  assignedByName: string;
  proyectoUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: "Te asignaron una tarea",
    bodyHtml: `<p style="margin:0;">${input.assignedByName} te asignó la tarea <strong>${input.tareaTitle}</strong> en el proyecto <strong>${input.proyectoName}</strong>.</p>`,
    ctaText: "Ver proyecto",
    ctaUrl: input.proyectoUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.assigneeEmail,
    subject: `Te asignaron: ${input.tareaTitle}`,
    text: `${input.assignedByName} te asignó la tarea "${input.tareaTitle}" en el proyecto "${input.proyectoName}": ${input.proyectoUrl}`,
    html,
  });
}
