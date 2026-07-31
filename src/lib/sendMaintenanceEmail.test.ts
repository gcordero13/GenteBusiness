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
import { sendMaintenanceReportEmail, sendSurveyEmail } from "./sendMaintenanceEmail";

function mockAdmin(settings: Record<string, unknown> | null) {
  const singleMock = vi.fn().mockResolvedValue({ data: settings, error: settings ? null : { message: "no row" } });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock }) };
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
  it("sends the survey link to the user's email", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin(VALID_SETTINGS) as never);

    await sendSurveyEmail({ userEmail: "ana@example.com", userName: "Ana", surveyUrl: "https://example.com/encuesta/abc" });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        text: expect.stringContaining("https://example.com/encuesta/abc"),
      }),
    );
  });
});
