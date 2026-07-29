import "server-only";
import nodemailer from "nodemailer";
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

function buildTransport(settings: EmailSettings) {
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
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
  const transport = buildTransport(settings);
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
  const transport = buildTransport(settings);
  await transport.sendMail({
    from: fromAddress(settings),
    to: input.userEmail,
    subject: "Encuesta de satisfacción - Mantenimiento preventivo",
    text: `Hola ${input.userName}, nos gustaría conocer tu opinión sobre el servicio de mantenimiento recibido: ${input.surveyUrl}`,
  });
}
