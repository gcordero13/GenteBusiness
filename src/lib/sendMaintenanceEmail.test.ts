import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above all other top-level code (including
// plain `const` declarations), so any mock referenced inside one must be
// created via vi.hoisted() to avoid a "Cannot access before initialization"
// TDZ error. See https://vitest.dev/api/vi.html#vi-hoisted
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
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
