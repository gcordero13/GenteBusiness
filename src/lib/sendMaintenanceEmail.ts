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
// the public, session-less maintenance-completion flow.
async function fetchPlatformLogoUrl(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("platform_settings").select("logo_url").eq("id", true).maybeSingle();
    return data?.logo_url ?? null;
  } catch {
    return null;
  }
}

export async function sendMaintenanceReportEmail(input: {
  userName: string;
  completedDate: string;
  pdfBytes: Uint8Array;
}): Promise<void> {
  const settings = await getEmailSettings();
  const transport = await buildTransport(settings);
  await transport.sendMail({
    from: fromAddress(settings),
    to: "acusesdeti@sanchezbusinesscorp.com",
    subject: `Mantenimiento - ${input.userName} - ${input.completedDate}`,
    text: "Se adjunta el formulario de mantenimiento preventivo completado.",
    attachments: [
      {
        filename: `Mantenimiento - ${input.userName} - ${input.completedDate}.pdf`,
        content: Buffer.from(input.pdfBytes),
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendSurveyEmail(input: {
  userEmail: string;
  userName: string;
  surveyUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: `Hola, ${input.userName} 👋`,
    bodyHtml: `
      <p style="margin:0 0 14px;">Gracias por confiar en nosotros para el mantenimiento de tu equipo.</p>
      <p style="margin:0;">Esta encuesta nos ayuda a mantener y mejorar la calidad de nuestro servicio — nos importas, y por eso queremos saber cómo fue tu experiencia. Solo te tomará un minuto.</p>
    `,
    ctaText: "Responder encuesta",
    ctaUrl: input.surveyUrl,
    logoUrl,
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.userEmail,
    subject: "¿Cómo fue tu experiencia? Encuesta de satisfacción",
    text: `Hola ${input.userName}, nos gustaría conocer tu opinión sobre el servicio de mantenimiento recibido: ${input.surveyUrl}`,
    html,
  });
}

export async function sendMaintenanceLinkEmail(input: {
  userEmail: string;
  userName: string;
  linkUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: `Hola, ${input.userName}`,
    bodyHtml: `
      <p style="margin:0 0 14px;">Te compartimos el enlace para completar el formulario de mantenimiento preventivo de tu equipo.</p>
      <p style="margin:0;">Solo toma unos minutos: revisa la información, completa el checklist y firma junto con el técnico.</p>
    `,
    ctaText: "Completar formulario",
    ctaUrl: input.linkUrl,
    logoUrl,
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.userEmail,
    subject: "Formulario de Mantenimiento Preventivo",
    text: `Completa tu formulario de mantenimiento preventivo aquí: ${input.linkUrl}`,
    html,
  });
}
