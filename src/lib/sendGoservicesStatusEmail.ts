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

// `detalle`, `requesterName` and `subcategoria` are genuinely free text typed
// by the requester (see CreateGoservicesRequestInput in
// solicitudes/goservices/actions.ts), unlike `typeLabel`/`departmentName`
// which are drawn from fixed, codebase- or admin-controlled lookups. Without
// escaping, a crafted value in one of those free-text fields could inject
// markup into the notification email — copied from
// sendComplaintNotificationEmail.ts.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFechaEs(createdAtIso: string): string {
  return new Date(createdAtIso).toLocaleDateString("es-DO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const RECIBIDO_CLOSING_BY_TYPE: Record<"mantenimiento" | "mensajeria", string> = {
  mantenimiento:
    "Hemos recibido tu solicitud. El equipo de Servicios Generales (SSGG) estará trabajando en tu solicitud dentro de los próximos 7 días laborales por orden de llegada y dependiendo de la complejidad. Si necesitas más información, no dudes en contactarte con nosotros.",
  mensajeria:
    "Hemos recibido tu solicitud. El equipo de Mensajería estará trabajando en tu solicitud dentro de los próximos 7 días laborales por orden de llegada y dependiendo de la complejidad. Si necesitas más información, no dudes en contactarte con nosotros.",
};

const STATUS_TITLES: Record<"recibido" | "completado" | "cancelado", string> = {
  recibido: "Solicitud Recibida",
  completado: "Solicitud Completada",
  cancelado: "Solicitud Cancelada",
};

function closingParagraph(status: "recibido" | "completado" | "cancelado", requestType: "mantenimiento" | "mensajeria"): string {
  if (status === "recibido") return RECIBIDO_CLOSING_BY_TYPE[requestType];
  if (status === "completado") {
    return "Tu solicitud ha sido completada. Gracias por tu paciencia. Si tienes alguna pregunta o inquietud sobre el trabajo realizado, no dudes en contactarte con nosotros.";
  }
  return "Tu solicitud ha sido cancelada. Si crees que esto es un error o necesitas más información, no dudes en contactarte con nosotros.";
}

export async function sendGoservicesStatusEmail(input: {
  requesterEmail: string;
  requestNumber: number;
  requesterName: string;
  requestType: "mantenimiento" | "mensajeria";
  typeLabel: string;
  subcategoria: string | null;
  departmentName: string | null;
  createdAtIso: string;
  detalle: string;
  status: "recibido" | "completado" | "cancelado";
  requestUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);

  const title = STATUS_TITLES[input.status];
  const closing = closingParagraph(input.status, input.requestType);
  const fechaLabel = formatFechaEs(input.createdAtIso);

  const htmlFields: string[] = [
    `<p style="margin:0 0 10px;">📌 <strong>N° de Solicitud:</strong> ${input.requestNumber}</p>`,
    `<p style="margin:0 0 10px;">👤 <strong>Solicitante:</strong> ${escapeHtml(input.requesterName)}</p>`,
    `<p style="margin:0 0 10px;">🚚 <strong>Tipo de solicitud:</strong> ${input.typeLabel}</p>`,
  ];
  if (input.subcategoria) {
    htmlFields.push(`<p style="margin:0 0 10px;">🚚 <strong>Categoria:</strong> ${escapeHtml(input.subcategoria)}</p>`);
  }
  if (input.departmentName) {
    htmlFields.push(`<p style="margin:0 0 10px;">🏢 <strong>Departamento:</strong> ${input.departmentName}</p>`);
  }
  htmlFields.push(`<p style="margin:0 0 10px;">📅 <strong>Fecha:</strong> ${fechaLabel}</p>`);
  htmlFields.push(
    `<p style="margin:0;white-space:pre-wrap;">📝 <strong>Detalle:</strong> ${escapeHtml(input.detalle)}</p>`,
  );

  const html = buildBrandedEmailHtml({
    title,
    bodyHtml: `
      ${htmlFields.join("\n")}
      <p style="margin:20px 0 0;">${escapeHtml(closing)}</p>
    `,
    ctaText: "Ver mi solicitud",
    ctaUrl: input.requestUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });

  const textLines: string[] = [
    `N° de Solicitud: ${input.requestNumber}`,
    `Solicitante: ${input.requesterName}`,
    `Tipo de solicitud: ${input.typeLabel}`,
  ];
  if (input.subcategoria) textLines.push(`Categoria: ${input.subcategoria}`);
  if (input.departmentName) textLines.push(`Departamento: ${input.departmentName}`);
  textLines.push(`Fecha: ${fechaLabel}`);
  textLines.push(`Detalle: ${input.detalle}`);

  const text = `${title}\n\n${textLines.join("\n")}\n\n${closing}\n\nVer: ${input.requestUrl}`;

  await transport.sendMail({
    from: fromAddress(settings),
    to: input.requesterEmail,
    subject: `${title} #${input.requestNumber}`,
    text,
    html,
  });
}

export async function sendGoservicesNewRequestEmail(input: {
  managerEmails: string[];
  requestNumber: number;
  requesterName: string;
  typeLabel: string;
  detalle: string;
  manageUrl: string;
}): Promise<void> {
  if (input.managerEmails.length === 0) return;

  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);

  const html = buildBrandedEmailHtml({
    title: `Nueva solicitud GoServices #${input.requestNumber}`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>Solicitante:</strong> ${escapeHtml(input.requesterName)}</p>
      <p style="margin:0 0 12px;"><strong>Tipo de solicitud:</strong> ${input.typeLabel}</p>
      <p style="margin:0;white-space:pre-wrap;"><strong>Detalle:</strong> ${escapeHtml(input.detalle)}</p>
    `,
    ctaText: "Ver solicitudes",
    ctaUrl: input.manageUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });

  await Promise.all(
    input.managerEmails.map((to) =>
      transport.sendMail({
        from: fromAddress(settings),
        to,
        subject: `Nueva solicitud GoServices #${input.requestNumber}`,
        text: `Nueva solicitud GoServices #${input.requestNumber} (${input.typeLabel}) de ${input.requesterName}: ${input.detalle}\n\nVer: ${input.manageUrl}`,
        html,
      }),
    ),
  );
}

export async function sendGoservicesAssignedEmail(input: {
  assigneeEmail: string;
  requestNumber: number;
  typeLabel: string;
  detalle: string;
  assignedUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);

  const html = buildBrandedEmailHtml({
    title: `Se te asignó la solicitud GoServices #${input.requestNumber}`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>Tipo de solicitud:</strong> ${input.typeLabel}</p>
      <p style="margin:0;white-space:pre-wrap;"><strong>Detalle:</strong> ${escapeHtml(input.detalle)}</p>
    `,
    ctaText: "Ver mis tareas asignadas",
    ctaUrl: input.assignedUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });

  await transport.sendMail({
    from: fromAddress(settings),
    to: input.assigneeEmail,
    subject: `Se te asignó la solicitud GoServices #${input.requestNumber}`,
    text: `Se te asignó la solicitud GoServices #${input.requestNumber} (${input.typeLabel}): ${input.detalle}\n\nVer: ${input.assignedUrl}`,
    html,
  });
}
