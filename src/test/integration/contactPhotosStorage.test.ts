import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("contact-photos storage bucket", () => {
  it("exists and is public", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket("contact-photos");

    expect(error).toBeNull();
    expect(data?.public).toBe(true);
  });
});
