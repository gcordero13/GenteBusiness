import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, createTransportMock, lookupMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });
  const lookupMock = vi.fn().mockResolvedValue({ address: "40.100.1.1", family: 4 });
  return { sendMailMock, createTransportMock, lookupMock };
});

vi.mock("nodemailer", () => ({ default: { createTransport: createTransportMock } }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock, default: { lookup: lookupMock } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { sendGoservicesStatusEmail } from "./sendGoservicesStatusEmail";

const VALID_SETTINGS = {
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "user@example.com",
  smtp_pass: "secret",
  smtp_sender_name: "Gente Sánchez Business",
  smtp_admin_email: "notificaciones@sanchezbusinesscorp.com",
};

function mockAdmin() {
  const singleMock = vi.fn().mockResolvedValue({ data: VALID_SETTINGS, error: null });
  const eqMock = vi.fn().mockReturnValue({
    single: singleMock,
    maybeSingle: vi.fn().mockResolvedValue({ data: { logo_url: null }, error: null }),
  });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
});

describe("sendGoservicesStatusEmail", () => {
  it("sends one email with the status and type in the subject", async () => {
    await sendGoservicesStatusEmail({
      requesterEmail: "empleado@sanchezbusinesscorp.com",
      typeLabel: "Cerrajería",
      status: "completado",
      requestUrl: "https://gente-business.vercel.app/solicitudes/goservices",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "empleado@sanchezbusinesscorp.com",
        subject: expect.stringContaining("Completado"),
      }),
    );

    const { text, html } = sendMailMock.mock.calls[0][0];
    expect(text).not.toBe(html);
    expect(html).toContain("Cerrajería");
  });

  it("falls back to the raw status string when it has no Spanish label", async () => {
    await sendGoservicesStatusEmail({
      requesterEmail: "empleado@sanchezbusinesscorp.com",
      typeLabel: "Plomería",
      status: "en_revision",
      requestUrl: "https://gente-business.vercel.app/solicitudes/goservices",
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("en_revision") }),
    );
  });
});
