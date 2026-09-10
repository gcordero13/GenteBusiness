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

// A complaint's category/submitter name are fixed, codebase-controlled
// strings, but its message is untrusted free text supplied by whoever
// submitted the complaint - and buildBrandedEmailHtml() inserts bodyHtml raw,
// without escaping it. Without this, a crafted complaint message containing
// HTML/script could inject markup into every viewer's notification email.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendComplaintNotificationEmail(input: {
  viewerEmails: string[];
  complaintNumber: number;
  categoryLabel: string;
  message: string;
  isAnonymous: boolean;
  submitterName: string | null;
  complaintsUrl: string;
}): Promise<void> {
  if (input.viewerEmails.length === 0) return;

  const settings = await getEmailSettings();
  const [transport, logoUrl] = await Promise.all([buildTransport(settings), fetchPlatformLogoUrl()]);

  const submitterLine = input.isAnonymous ? "Anónima" : (input.submitterName ?? "Nombre no disponible");
  const html = buildBrandedEmailHtml({
    title: `Nuevo reporte #${input.complaintNumber}`,
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>Categoría:</strong> ${escapeHtml(input.categoryLabel)}</p>
      <p style="margin:0 0 12px;"><strong>Quién envía:</strong> ${escapeHtml(submitterLine)}</p>
      <p style="margin:0 0 4px;"><strong>Mensaje:</strong></p>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(input.message)}</p>
    `,
    ctaText: "Revisar reporte",
    ctaUrl: input.complaintsUrl,
    logoUrl,
    footerText: "Correo generado automáticamente por Gente Sánchez Business.",
  });

  await Promise.all(
    input.viewerEmails.map((to) =>
      transport.sendMail({
        from: fromAddress(settings),
        to,
        subject: `Nuevo reporte #${input.complaintNumber} - ${input.categoryLabel}`,
        text: `Se registró un nuevo reporte #${input.complaintNumber} (${input.categoryLabel}) de ${submitterLine}: ${input.message}\n\nRevisar: ${input.complaintsUrl}`,
        html,
      }),
    ),
  );
}
