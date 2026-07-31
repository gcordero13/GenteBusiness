import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/managementApi", () => ({
  updateAuthConfig: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAuthConfig } from "@/lib/supabase/managementApi";
import { saveSmtpSettings, savePlatformLogo } from "./actions";

function mockServerClient(flags: { can_manage: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "caller-id" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [flags], error: null }),
  };
}

function mockAdminClient(updateError: { message: string } | null = null) {
  const eqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ update: updateMock }), _mocks: { updateMock, eqMock } };
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
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("updates the Auth SMTP config and raises the email rate limit when authorized", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    vi.mocked(updateAuthConfig).mockResolvedValue(undefined);
    const admin = mockAdminClient();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

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
    expect(admin.from).toHaveBeenCalledWith("email_settings");
    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        smtp_host: validInput.smtp_host,
        smtp_port: 587,
        smtp_user: validInput.smtp_user,
        smtp_pass: validInput.smtp_pass,
        smtp_sender_name: validInput.smtp_sender_name,
        smtp_admin_email: validInput.smtp_admin_email,
      }),
    );
    expect(admin._mocks.eqMock).toHaveBeenCalledWith("id", true);
  });

  it("surfaces an error message if the Management API call fails", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    vi.mocked(updateAuthConfig).mockRejectedValue(new Error("boom"));

    const result = await saveSmtpSettings(validInput);

    expect(result.error).toBe("boom");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("surfaces a distinguishing error if the local email_settings mirror write fails after Auth config succeeds", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ can_manage: true }) as never);
    vi.mocked(updateAuthConfig).mockResolvedValue(undefined);
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient({ message: "connection refused" }) as never,
    );

    const result = await saveSmtpSettings(validInput);

    expect(result.error).toBe(
      "Configuración guardada en Supabase Auth, pero falló el guardado local: connection refused",
    );
  });
});

describe("savePlatformLogo", () => {
  it("rejects callers without can_manage on the settings module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await savePlatformLogo("https://cdn.example.com/logo.png");

    expect(result.error).toBe("No autorizado");
  });

  it("updates the platform_settings row when authorized", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      ...mockServerClient({ can_manage: true }),
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }),
    };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await savePlatformLogo("https://cdn.example.com/logo.png");

    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("platform_settings");
    expect(supabase.from().update).toHaveBeenCalledWith({
      logo_url: "https://cdn.example.com/logo.png",
    });
    expect(eq).toHaveBeenCalledWith("id", true);
  });
});
