import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("company-logos storage bucket", () => {
  it("exists, is public, and restricts size/type", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket("company-logos");

    expect(error).toBeNull();
    expect(data?.public).toBe(true);
    expect(data?.file_size_limit).toBe(2097152);
    expect(data?.allowed_mime_types).toEqual(
      expect.arrayContaining(["image/png", "image/jpeg", "image/svg+xml"]),
    );
  });
});
