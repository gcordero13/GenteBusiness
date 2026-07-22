import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/managementApi", () => ({
  updateAuthConfig: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { updateAuthConfig } from "@/lib/supabase/managementApi";
import { saveSmtpSettings } from "./actions";

function mockServerClient(flags: { can_manage: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "caller-id" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [flags], error: null }),
  };
}

const validInput = {
  smtp_host: "smtp.office365.com",
  smtp_port: "587",
  smtp_user: "notificaciones@empresa.com",
  smtp_pass: "secret123",
  smtp_sender_name: "Gente Sánchez Business",
  smtp_admin_email: "notificaciones@empresa.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveSmtpSettings", () => {
  it("rejects callers without can_manage on the settings module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await saveSmtpSettings(validInput);

    expect(result.error).toBe("No autorizado");
    expect(updateAuthConfig).not.toHaveBeenCalled();
  });

  it("updates the Auth SMTP config and raises the email rate limit when authorized", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    vi.mocked(updateAuthConfig).mockResolvedValue(undefined);

    const result = await saveSmtpSettings(validInput);

    expect(result.error).toBeUndefined();
    expect(updateAuthConfig).toHaveBeenCalledWith({
      smtp_host: validInput.smtp_host,
      smtp_port: validInput.smtp_port,
      smtp_user: validInput.smtp_user,
      smtp_pass: validInput.smtp_pass,
      smtp_sender_name: validInput.smtp_sender_name,
      smtp_admin_email: validInput.smtp_admin_email,
      rate_limit_email_sent: 30,
    });
  });

  it("surfaces an error message if the Management API call fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    vi.mocked(updateAuthConfig).mockRejectedValue(new Error("boom"));

    const result = await saveSmtpSettings(validInput);

    expect(result.error).toBe("boom");
  });
});
