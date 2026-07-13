import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("Supabase project connectivity", () => {
  it("can reach the real project with the service role key", async () => {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.listUsers({ perPage: 1 });
    expect(error).toBeNull();
  });
});
