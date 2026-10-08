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

// Fetched via the admin client (not the request-scoped cookie client) so this
// works uniformly whether the caller is an authenticated technician action or
// a public, session-less flow.
async function fetchPlatformLogoUrl(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("platform_settings").select("logo_url").eq("id", true).maybeSingle();
    return data?.logo_url ?? null;
  } catch {
    return null;
  }
}

// GoServices requests only ever carry a `categoria` or `tipo_mensajeria`
// value drawn from a fixed, check-constrained enum (see
// supabase/migrations/20261008120000_goservices_module.sql), never free
// text, so typeLabel is always a codebase-controlled label and does not need
// HTML-escaping the way sendComplaintNotificationEmail.ts escapes its
// free-text complaint message.
const STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  completado: "Completado",
  cancelado: "Cancelado",
};

export async function sendGoservicesStatusEmail(input: {
  requesterEmail: string;
  typeLabel: string;
  status: string;
  requestUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const statusLabel = STATUS_LABELS[input.status] ?? input.status;

  const html = buildBrandedEmailHtml({
    title: `Tu solicitud de GoServices: ${statusLabel}`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>Tipo:</strong> ${input.typeLabel}</p>
      <p style="margin:0;"><strong>Estatus:</strong> ${statusLabel}</p>
    `,
    ctaText: "Ver mis solicitudes",
    ctaUrl: input.requestUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });

  await transport.sendMail({
    from: fromAddress(settings),
    to: input.requesterEmail,
    subject: `Tu solicitud de GoServices: ${statusLabel}`,
    text: `Tu solicitud de GoServices (${input.typeLabel}) cambió de estatus a: ${statusLabel}\n\nVer: ${input.requestUrl}`,
    html,
  });
}
