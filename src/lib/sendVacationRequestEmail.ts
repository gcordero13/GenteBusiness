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

export async function sendVacationRequestSubmittedEmail(input: {
  supervisorEmail: string;
  employeeName: string;
  requestUrl: string;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: "Nueva solicitud de vacaciones",
    bodyHtml: `<p style="margin:0;">${input.employeeName} envió una solicitud de vacaciones que necesita tu aprobación.</p>`,
    ctaText: "Revisar solicitud",
    ctaUrl: input.requestUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.supervisorEmail,
    subject: `Solicitud de vacaciones de ${input.employeeName}`,
    text: `${input.employeeName} envió una solicitud de vacaciones que necesita tu aprobación: ${input.requestUrl}`,
    html,
  });
}

export async function sendVacationRequestSupervisorDecisionEmail(input: {
  employeeEmail: string;
  employeeName: string;
  approved: boolean;
  requestUrl: string;
  rrhhEmails?: string[];
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);

  const employeeHtml = buildBrandedEmailHtml({
    title: input.approved ? "Tu solicitud avanzó a Recursos Humanos" : "Tu solicitud de vacaciones fue rechazada",
    bodyHtml: `<p style="margin:0;">${
      input.approved
        ? "Tu jefe directo aprobó tu solicitud de vacaciones. Ahora está pendiente de la aprobación final de Recursos Humanos."
        : "Tu jefe directo rechazó tu solicitud de vacaciones."
    }</p>`,
    ctaText: "Ver mi solicitud",
    ctaUrl: input.requestUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.employeeEmail,
    subject: input.approved ? "Tu solicitud de vacaciones avanzó a RRHH" : "Tu solicitud de vacaciones fue rechazada",
    text: input.approved
      ? `Tu jefe directo aprobó tu solicitud de vacaciones. Ahora está pendiente de la aprobación final de Recursos Humanos: ${input.requestUrl}`
      : `Tu jefe directo rechazó tu solicitud de vacaciones: ${input.requestUrl}`,
    html: employeeHtml,
  });

  if (input.approved && input.rrhhEmails?.length) {
    const rrhhHtml = buildBrandedEmailHtml({
      title: "Solicitud de vacaciones pendiente de aprobación",
      bodyHtml: `<p style="margin:0;">La solicitud de ${input.employeeName} fue aprobada por su jefe directo y necesita tu aprobación final.</p>`,
      ctaText: "Revisar solicitud",
      ctaUrl: input.requestUrl,
      logoUrl,
      footerText: "Correo generado automáticamente por Gente Sánchez Business.",
    });
    await Promise.all(
      input.rrhhEmails.map((to) =>
        transport.sendMail({
          from: fromAddress(settings),
          to,
          subject: `Solicitud de vacaciones de ${input.employeeName} pendiente de RRHH`,
          text: `La solicitud de ${input.employeeName} fue aprobada por su jefe directo y necesita tu aprobación final: ${input.requestUrl}`,
          html: rrhhHtml,
        }),
      ),
    );
  }
}

export async function sendVacationRequestRrhhDecisionEmail(input: {
  employeeEmail: string;
  employeeName: string;
  approved: boolean;
}): Promise<void> {
  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);
  const html = buildBrandedEmailHtml({
    title: input.approved ? "¡Tu solicitud de vacaciones fue aprobada!" : "Tu solicitud de vacaciones fue rechazada",
    bodyHtml: `<p style="margin:0;">Recursos Humanos ${input.approved ? "aprobó" : "rechazó"} tu solicitud de vacaciones.</p>`,
    ctaText: "Ver mi solicitud",
    ctaUrl: "",
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.employeeEmail,
    subject: input.approved ? "Tu solicitud de vacaciones fue aprobada" : "Tu solicitud de vacaciones fue rechazada",
    text: input.approved
      ? "Recursos Humanos aprobó tu solicitud de vacaciones."
      : "Recursos Humanos rechazó tu solicitud de vacaciones.",
    html,
  });
}
