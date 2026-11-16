import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sendPasswordResetEmail", () => ({
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("@/lib/siteUrl", () => ({
  getSiteUrl: vi.fn().mockResolvedValue("https://gente-business.vercel.app"),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

import { sendPasswordResetEmail } from "@/lib/sendPasswordResetEmail";
import { redirect } from "next/navigation";
import { requestPasswordReset } from "./actions";

function formDataFor(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  it("redirects to a generic success state when the send fails (e.g. the email isn't registered)", async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new Error("boom"));

    await expect(requestPasswordReset(formDataFor("nadie@empresa.com"))).rejects.toThrow(
      "REDIRECT",
    );

    expect(redirect).toHaveBeenCalledWith("/forgot-password?sent=1");
  });

  it("redirects to a generic success state when the send succeeds", async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

    await expect(requestPasswordReset(formDataFor("real@empresa.com"))).rejects.toThrow(
      "REDIRECT",
    );

    expect(redirect).toHaveBeenCalledWith("/forgot-password?sent=1");
  });

  it("builds the confirmation link from the current request's origin, not a fixed env var", async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

    await expect(requestPasswordReset(formDataFor("real@empresa.com"))).rejects.toThrow(
      "REDIRECT",
    );

    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      email: "real@empresa.com",
      siteUrl: "https://gente-business.vercel.app",
    });
  });
});
