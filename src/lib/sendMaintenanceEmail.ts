import "server-only";
import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const transport = await buildTransport(settings);
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.userEmail,
    subject: "Encuesta de satisfacción - Mantenimiento preventivo",
    text: `Hola ${input.userName}, nos gustaría conocer tu opinión sobre el servicio de mantenimiento recibido: ${input.surveyUrl}`,
  });
}
