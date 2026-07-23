import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

function mockSupabase(verifyOtpResult: { error: { message: string } | null }) {
  return {
    auth: {
      verifyOtp: vi.fn().mockResolvedValue(verifyOtpResult),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/confirm", () => {
  it("verifies the token and redirects to `next` on success", async () => {
    const supabase = mockSupabase({ error: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const request = new NextRequest(
      "https://gente-business.vercel.app/auth/confirm?token_hash=abc123&type=recovery&next=/reset-password",
    );

    const response = await GET(request);

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc123",
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://gente-business.vercel.app/reset-password");
  });

  it("redirects to login with an error when verification fails", async () => {
    const supabase = mockSupabase({ error: { message: "expired" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const request = new NextRequest(
      "https://gente-business.vercel.app/auth/confirm?token_hash=expired&type=recovery&next=/reset-password",
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=");
  });

  it("redirects to login when required params are missing", async () => {
    const request = new NextRequest("https://gente-business.vercel.app/auth/confirm");

    const response = await GET(request);

    expect(createClient).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?error=");
  });
});
