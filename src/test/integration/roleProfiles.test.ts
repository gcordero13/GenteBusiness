import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

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
    // Every profile should have exactly 13 rows (one per module) after migration.
    const byProfile = new Map<string, number>();
    for (const row of data ?? []) {
      const name = (row.role_profiles as unknown as { name: string }).name;
      byProfile.set(name, (byProfile.get(name) ?? 0) + 1);
    }
    expect(byProfile.get("Viewer")).toBe(13);
    expect(byProfile.get("Editor")).toBe(13);
    expect(byProfile.get("Super Admin")).toBe(13);
  });

  it("has the 13 expected modules", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.from("modules").select("key").order("key");

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.key).sort()).toEqual(
      [
        "activities",
        "attendance_devices",
        "companies",
        "contacts",
        "departments",
        "document_stamps",
        "maintenance",
        "ponchador",
        "role_profiles",
        "schedules",
        "settings",
        "solicitudes_vacaciones",
        "users",
      ].sort(),
    );
  });
});

describe("role_profiles delete restrictions", () => {
  let admin_user: TestUser | undefined;
  let viewer: TestUser | undefined;
  let createdProfileId: string | undefined;

  afterEach(async () => {
    const admin = createAdminClient();
    if (createdProfileId) {
      await admin.from("role_profiles").delete().eq("id", createdProfileId);
      createdProfileId = undefined;
    }
    if (admin_user) await deleteTestUser(admin_user.id);
    if (viewer) await deleteTestUser(viewer.id);
    admin_user = undefined;
    viewer = undefined;
  });

  it("lets a can_manage user delete an unassigned, non-Super-Admin profile, cascading its permission rows", async () => {
    admin_user = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: created } = await admin
      .from("role_profiles")
      .insert({ name: `Throwaway ${crypto.randomUUID()}` })
      .select()
      .single();
    createdProfileId = created!.id;

    const { error } = await admin_user.client.from("role_profiles").delete().eq("id", createdProfileId);
    expect(error).toBeNull();

    const { data: stillThere } = await admin.from("role_profiles").select("id").eq("id", createdProfileId).maybeSingle();
    expect(stillThere).toBeNull();

    const { data: leftoverPermissions } = await admin
      .from("role_profile_permissions")
      .select("id")
      .eq("role_profile_id", createdProfileId);
    expect(leftoverPermissions).toEqual([]);

    createdProfileId = undefined;
  });

  it("blocks deleting a profile that still has an assigned user", async () => {
    admin_user = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: created } = await admin
      .from("role_profiles")
      .insert({ name: `Throwaway ${crypto.randomUUID()}` })
      .select()
      .single();
    createdProfileId = created!.id;

    viewer = await createTestUser("Viewer");
    await admin.from("app_users").update({ role_profile_id: createdProfileId }).eq("id", viewer.id);

    const { error } = await admin_user.client.from("role_profiles").delete().eq("id", createdProfileId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("usuario(s) asignado(s)");

    const { data: stillThere } = await admin.from("role_profiles").select("id").eq("id", createdProfileId).maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("blocks deleting the Super Admin profile even with zero assigned users in a fresh check", async () => {
    admin_user = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: superAdminProfile } = await admin
      .from("role_profiles")
      .select("id")
      .eq("name", "Super Admin")
      .single();

    const { error } = await admin_user.client.from("role_profiles").delete().eq("id", superAdminProfile!.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Super Admin");

    const { data: stillThere } = await admin
      .from("role_profiles")
      .select("id")
      .eq("id", superAdminProfile!.id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("blocks a user without can_manage on role_profiles from deleting any profile", async () => {
    const admin = createAdminClient();
    const { data: created } = await admin
      .from("role_profiles")
      .insert({ name: `Throwaway ${crypto.randomUUID()}` })
      .select()
      .single();
    createdProfileId = created!.id;

    viewer = await createTestUser("Viewer");
    const { error } = await viewer.client.from("role_profiles").delete().eq("id", createdProfileId);
    // RLS silently excludes the row from the delete's target set rather than
    // raising an error - the row simply isn't affected.
    expect(error).toBeNull();

    const { data: stillThere } = await admin.from("role_profiles").select("id").eq("id", createdProfileId).maybeSingle();
    expect(stillThere).not.toBeNull();
  });
});
