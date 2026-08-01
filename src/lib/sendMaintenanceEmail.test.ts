import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above all other top-level code (including
// plain `const` declarations), so any mock referenced inside one must be
// created via vi.hoisted() to avoid a "Cannot access before initialization"
// TDZ error. See https://vitest.dev/api/vi.html#vi-hoisted
const { sendMailMock, createTransportMock, lookupMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });
  const lookupMock = vi.fn().mockResolvedValue({ address: "40.100.1.1", family: 4 });
  return { sendMailMock, createTransportMock, lookupMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
  default: { lookup: lookupMock },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaintenanceLinkEmail, sendMaintenanceReportEmail, sendSurveyEmail } from "./sendMaintenanceEmail";

function mockAdmin(settings: Record<string, unknown> | null, logoUrl: string | null = null) {
  const singleMock = vi.fn().mockResolvedValue({ data: settings, error: settings ? null : { message: "no row" } });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

  const logoMaybeSingleMock = vi.fn().mockResolvedValue({ data: { logo_url: logoUrl }, error: null });
  const logoEqMock = vi.fn().mockReturnValue({ maybeSingle: logoMaybeSingleMock });
  const logoSelectMock = vi.fn().mockReturnValue({ eq: logoEqMock });

  return {
    from: vi.fn((table: string) => {
      if (table === "platform_settings") return { select: logoSelectMock };
      return { select: selectMock };
    }),
  };
}

const VALID_SETTINGS = {
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "user@example.com",
  smtp_pass: "secret",
  smtp_sender_name: "Gente Sánchez Business",
  smtp_admin_email: "notificaciones@sanchezbusinesscorp.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendMaintenanceReportEmail", () => {
  it("throws when SMTP settings are not configured", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(null) as never);

    await expect(
      sendMaintenanceReportEmail({ userName: "Ana García", completedDate: "28-07-2026", pdfBytes: new Uint8Array([1]) }),
    ).rejects.toThrow("Configuración SMTP incompleta");
  });

  it("sends the PDF as an attachment to acusesdeti@sanchezbusinesscorp.com", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendMaintenanceReportEmail({ userName: "Ana García", completedDate: "28-07-2026", pdfBytes: new Uint8Array([1, 2, 3]) });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "acusesdeti@sanchezbusinesscorp.com",
        subject: "Mantenimiento - Ana García - 28-07-2026",
        attachments: [expect.objectContaining({ filename: "Mantenimiento - Ana García - 28-07-2026.pdf" })],
      }),
    );
  });

  it("connects using the IPv4-resolved address while keeping TLS validation on the real hostname", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendMaintenanceReportEmail({ userName: "Ana García", completedDate: "28-07-2026", pdfBytes: new Uint8Array([1]) });

    expect(lookupMock).toHaveBeenCalledWith("smtp.example.com", { family: 4 });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "40.100.1.1",
        tls: expect.objectContaining({ servername: "smtp.example.com" }),
      }),
    );
  });

  it("falls back to the configured hostname if IPv4 resolution fails", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));

    await sendMaintenanceReportEmail({ userName: "Ana García", completedDate: "28-07-2026", pdfBytes: new Uint8Array([1]) });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com" }));
  });
});

describe("sendSurveyEmail", () => {
  it("sends the survey link to the user's email with an HTML body containing a CTA button", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendSurveyEmail({ userEmail: "ana@example.com", userName: "Ana", surveyUrl: "https://example.com/encuesta/abc" });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        subject: expect.stringContaining("satisfacción"),
        text: expect.stringContaining("https://example.com/encuesta/abc"),
        html: expect.stringContaining("https://example.com/encuesta/abc"),
      }),
    );
    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain("Responder encuesta");
    expect(html).toContain("nos importas");
  });

  it("embeds the platform logo in the HTML when one is configured", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS, "https://cdn.example.com/logo.png") as never);

    await sendSurveyEmail({ userEmail: "ana@example.com", userName: "Ana", surveyUrl: "https://example.com/encuesta/abc" });

    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain("https://cdn.example.com/logo.png");
  });
});

describe("sendMaintenanceLinkEmail", () => {
  it("sends the maintenance link with an HTML body containing a CTA button", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendMaintenanceLinkEmail({
      userEmail: "ana@example.com",
      userName: "Ana",
      linkUrl: "https://example.com/mantenimiento/abc",
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        subject: expect.stringContaining("Mantenimiento"),
        text: expect.stringContaining("https://example.com/mantenimiento/abc"),
        html: expect.stringContaining("https://example.com/mantenimiento/abc"),
      }),
    );
    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain("Completar formulario");
  });

  it("throws when SMTP settings are not configured", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(null) as never);

    await expect(
      sendMaintenanceLinkEmail({ userEmail: "ana@example.com", userName: "Ana", linkUrl: "https://example.com/x" }),
    ).rejects.toThrow("Configuración SMTP incompleta");
  });
});
