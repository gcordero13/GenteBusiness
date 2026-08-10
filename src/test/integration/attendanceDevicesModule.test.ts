import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("attendance_devices module seed data", () => {
  it("exists as a module with permission rows for every role profile, Super Admin granted can_manage by default", async () => {
    const admin = createAdminClient();

    const { data: moduleRow, error: moduleError } = await admin
      .from("modules")
      .select("id, key, label")
      .eq("key", "attendance_devices")
      .single();

    expect(moduleError).toBeNull();
    expect(moduleRow?.label).toBe("Ponchadores");

    const { data: permissionRows, error: permissionError } = await admin
      .from("role_profile_permissions")
      .select("can_manage, role_profiles(name)")
      .eq("module_id", moduleRow!.id);

    expect(permissionError).toBeNull();
    expect(permissionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          can_manage: true,
          role_profiles: expect.objectContaining({ name: "Super Admin" }),
        }),
        expect.objectContaining({
          can_manage: false,
          role_profiles: expect.objectContaining({ name: "Viewer" }),
        }),
      ]),
    );
  });
});
