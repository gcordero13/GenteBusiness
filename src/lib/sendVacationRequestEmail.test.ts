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
import {
  sendVacationRequestSubmittedEmail,
  sendVacationRequestSupervisorDecisionEmail,
  sendVacationRequestRrhhDecisionEmail,
} from "./sendVacationRequestEmail";

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
  const eqMock = vi.fn().mockReturnValue({ single: singleMock, maybeSingle: vi.fn().mockResolvedValue({ data: { logo_url: null }, error: null }) });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
});

describe("sendVacationRequestSubmittedEmail", () => {
  it("emails the resolved supervisor with a CTA button", async () => {
    await sendVacationRequestSubmittedEmail({
      supervisorEmail: "jefe@example.com",
      employeeName: "Ana García",
      requestUrl: "https://example.com/solicitudes/vacaciones",
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jefe@example.com", html: expect.stringContaining("Revisar solicitud") }),
    );
  });
});

describe("sendVacationRequestSupervisorDecisionEmail", () => {
  it("notifies the employee when the supervisor approves", async () => {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: true,
      requestUrl: "https://example.com/solicitudes/vacaciones",
    });

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com" }));
  });

  it("also notifies every RRHH authorizer when the supervisor approves", async () => {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: true,
      requestUrl: "https://example.com/solicitudes/vacaciones",
      rrhhEmails: ["rrhh1@example.com", "rrhh2@example.com"],
    });

    expect(sendMailMock).toHaveBeenCalledTimes(3);
  });

  it("does not email RRHH when the supervisor rejects", async () => {
    await sendVacationRequestSupervisorDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: false,
      requestUrl: "https://example.com/solicitudes/vacaciones",
      rrhhEmails: ["rrhh1@example.com"],
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendVacationRequestRrhhDecisionEmail", () => {
  it("notifies the employee of the final decision", async () => {
    await sendVacationRequestRrhhDecisionEmail({
      employeeEmail: "ana@example.com",
      employeeName: "Ana García",
      approved: false,
    });

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com" }));
  });
});
