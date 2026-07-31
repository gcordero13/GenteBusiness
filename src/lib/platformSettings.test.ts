import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getPlatformLogoUrl } from "./platformSettings";

function mockSupabase(logoUrl: string | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: logoUrl === null ? null : { logo_url: logoUrl },
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPlatformLogoUrl", () => {
  it("returns the logo URL when one is set", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase("https://cdn.example.com/logo.png") as never,
    );

    const result = await getPlatformLogoUrl();

    expect(result).toBe("https://cdn.example.com/logo.png");
  });

  it("returns null when no logo has been uploaded yet", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase(null) as never);

    const result = await getPlatformLogoUrl();

    expect(result).toBeNull();
  });
});
