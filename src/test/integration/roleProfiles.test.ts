import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("role_profiles seed data", () => {
  it("has the three default profiles with the right flags", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("role_profiles")
      .select("name, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage_platform")
      .order("name");

    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Viewer", can_view: true, can_add: false }),
        expect.objectContaining({ name: "Editor", can_view: true, can_add: true, can_delete: false }),
        expect.objectContaining({ name: "Super Admin", can_manage_platform: true }),
      ]),
    );
  });
});
