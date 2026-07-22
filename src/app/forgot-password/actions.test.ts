import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "./actions";

function mockServerClient(result: { error: { code?: string; message: string } | null }) {
  return {
    auth: {
      resetPasswordForEmail: vi.fn().mockResolvedValue(result),
    },
  };
}

function formDataFor(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  it("redirects to a generic success state even if the email isn't registered", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ error: { message: "User not found" } }) as never,
    );

    await expect(requestPasswordReset(formDataFor("nadie@empresa.com"))).rejects.toThrow(
      "REDIRECT",
    );

    expect(redirect).toHaveBeenCalledWith("/forgot-password?sent=1");
  });

  it("redirects to a generic success state when the reset actually succeeds", async () => {
    vi.mocked(createClient).mockResolvedValue(mockServerClient({ error: null }) as never);

    await expect(requestPasswordReset(formDataFor("real@empresa.com"))).rejects.toThrow(
      "REDIRECT",
    );

    expect(redirect).toHaveBeenCalledWith("/forgot-password?sent=1");
  });

  it("surfaces a rate-limit error distinctly instead of the generic success message", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ error: { code: "over_email_send_rate_limit", message: "wait" } }) as never,
    );

    await expect(requestPasswordReset(formDataFor("real@empresa.com"))).rejects.toThrow(
      "REDIRECT",
    );

    expect(redirect).toHaveBeenCalledWith(
      "/forgot-password?error=Espera%20unos%20segundos%20antes%20de%20volver%20a%20intentarlo.",
    );
  });
});
