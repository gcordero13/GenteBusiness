import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("role_profile_permissions seed data", () => {
  it("has the three default profiles with the right per-module flags, migrated from the old flat model", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("role_profile_permissions")
      .select("can_view, can_add, can_delete, can_manage, role_profiles(name), modules(key)")
      .order("role_profiles(name)");

    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          can_view: true,
          can_add: false,
          role_profiles: expect.objectContaining({ name: "Viewer" }),
        }),
        expect.objectContaining({
          can_view: true,
          can_add: true,
          can_delete: false,
          role_profiles: expect.objectContaining({ name: "Editor" }),
        }),
        expect.objectContaining({
          can_manage: true,
          role_profiles: expect.objectContaining({ name: "Super Admin" }),
        }),
      ]),
    );
    // Every profile should have exactly 8 rows (one per module) after migration.
    const byProfile = new Map<string, number>();
    for (const row of data ?? []) {
      const name = (row.role_profiles as unknown as { name: string }).name;
      byProfile.set(name, (byProfile.get(name) ?? 0) + 1);
    }
    expect(byProfile.get("Viewer")).toBe(8);
    expect(byProfile.get("Editor")).toBe(8);
    expect(byProfile.get("Super Admin")).toBe(8);
  });

  it("has the 8 expected modules", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.from("modules").select("key").order("key");

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.key).sort()).toEqual(
      [
        "activities",
        "companies",
        "contacts",
        "departments",
        "document_stamps",
        "role_profiles",
        "settings",
        "users",
      ].sort(),
    );
  });
});
