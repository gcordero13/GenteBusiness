import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("document_stamps module seed data", () => {
  it("exists as a module with permission rows for every role profile, Super Admin granted by default", async () => {
    const admin = createAdminClient();

    const { data: moduleRow, error: moduleError } = await admin
      .from("modules")
      .select("id, key, label")
      .eq("key", "document_stamps")
      .single();

    expect(moduleError).toBeNull();
    expect(moduleRow?.label).toBe("Sellos y Firmas");

    const { data: permissionRows, error: permissionError } = await admin
      .from("role_profile_permissions")
      .select("can_add, role_profiles(name)")
      .eq("module_id", moduleRow!.id);

    expect(permissionError).toBeNull();
    expect(permissionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          can_add: true,
          role_profiles: expect.objectContaining({ name: "Super Admin" }),
        }),
        expect.objectContaining({
          can_add: false,
          role_profiles: expect.objectContaining({ name: "Viewer" }),
        }),
      ]),
    );
  });
});
