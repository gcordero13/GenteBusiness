import { describe, expect, it, vi } from "vitest";

const mockHeaders = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => mockHeaders.get(key) ?? null,
  }),
}));

import { getSiteUrl } from "./siteUrl";

describe("getSiteUrl", () => {
  it("uses the x-forwarded-host/proto headers when present (behind Vercel's proxy)", async () => {
    mockHeaders.clear();
    mockHeaders.set("x-forwarded-host", "gente-business.vercel.app");
    mockHeaders.set("x-forwarded-proto", "https");
    mockHeaders.set("host", "some-internal-host");

    expect(await getSiteUrl()).toBe("https://gente-business.vercel.app");
  });

  it("falls back to the host header and infers http for localhost", async () => {
    mockHeaders.clear();
    mockHeaders.set("host", "localhost:3000");

    expect(await getSiteUrl()).toBe("http://localhost:3000");
  });

  it("infers https for a non-localhost host with no explicit proto header", async () => {
    mockHeaders.clear();
    mockHeaders.set("host", "gente-business-preview.vercel.app");

    expect(await getSiteUrl()).toBe("https://gente-business-preview.vercel.app");
  });

  it("falls back to NEXT_PUBLIC_SITE_URL if no host header is available at all", async () => {
    mockHeaders.clear();
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://fallback.example.com";

    expect(await getSiteUrl()).toBe("https://fallback.example.com");

    process.env.NEXT_PUBLIC_SITE_URL = original;
  });
});
