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
import { confirmToken } from "./actions";

function mockSupabase(verifyOtpResult: { error: { message: string } | null }) {
  return {
    auth: {
      verifyOtp: vi.fn().mockResolvedValue(verifyOtpResult),
    },
  };
}

function formDataFor(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmToken", () => {
  it("verifies the token and redirects to `next` on success", async () => {
    const supabase = mockSupabase({ error: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(
      confirmToken(formDataFor({ token_hash: "abc123", type: "recovery", next: "/reset-password" })),
    ).rejects.toThrow("REDIRECT");

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" });
    expect(redirect).toHaveBeenCalledWith("/reset-password");
  });

  it("redirects to login with an error when verification fails", async () => {
    const supabase = mockSupabase({ error: { message: "expired" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await expect(
      confirmToken(formDataFor({ token_hash: "expired", type: "recovery", next: "/reset-password" })),
    ).rejects.toThrow("REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login?error=" + encodeURIComponent("El enlace no es válido o ya expiró."));
  });

  it("redirects to login when required fields are missing", async () => {
    await expect(confirmToken(formDataFor({ next: "/reset-password" }))).rejects.toThrow("REDIRECT");

    expect(createClient).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login?error=" + encodeURIComponent("El enlace no es válido o ya expiró."));
  });
});
