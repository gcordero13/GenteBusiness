import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("companies RLS", () => {
  let editor: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (editor) await deleteTestUser(editor.id);
    if (admin) await deleteTestUser(admin.id);
    editor = undefined;
    admin = undefined;
  });

  it("lets any authenticated user read companies", async () => {
    editor = await createTestUser("Editor");

    const { data, error } = await editor.client.from("companies").select("*");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("blocks an Editor (no can_manage_platform) from creating a company", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client.from("companies").insert({ name: "Should Fail Co" });

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin create a company", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("companies")
      .insert({ name: `Test Co ${admin.id}` })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.name).toContain("Test Co");

    const adminClient = createAdminClient();
    await adminClient.from("companies").delete().eq("id", data!.id);
  });
});
