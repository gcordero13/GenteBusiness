import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function assignModulePermission(userId: string, canAdd: boolean) {
  const admin = createAdminClient();
  const { data: appUser } = await admin.from("app_users").select("role_profile_id").eq("id", userId).single();
  const { data: moduleRow } = await admin.from("modules").select("id").eq("key", "document_stamps").single();
  await admin
    .from("role_profile_permissions")
    .update({ can_add: canAdd })
    .eq("role_profile_id", appUser!.role_profile_id)
    .eq("module_id", moduleRow!.id);
}

async function makeCompany() {
  const admin = createAdminClient();
  const { data } = await admin.from("companies").insert({ name: "Sellos Test Co" }).select().single();
  return data!.id as string;
}

describe("company_seals RLS", () => {
  let viewer: TestUser | undefined;
  let editor: TestUser | undefined;
  let companyId: string;
  let sealId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (sealId) await admin.from("company_seals").delete().eq("id", sealId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (viewer) await deleteTestUser(viewer.id);
    if (editor) await deleteTestUser(editor.id);
    viewer = undefined;
    editor = undefined;
    sealId = "";
  });

  it("blocks a user without can_add from creating a seal", async () => {
    companyId = await makeCompany();
    viewer = await createTestUser("Viewer");
    await assignModulePermission(viewer.id, false);

    const { error } = await viewer.client
      .from("company_seals")
      .insert({ company_id: companyId, name: "Sello X", storage_path: "x/x.png" });

    expect(error).not.toBeNull();
  });

  it("lets a user with can_add create and read a seal", async () => {
    companyId = await makeCompany();
    editor = await createTestUser("Viewer");
    await assignModulePermission(editor.id, true);

    const { data, error } = await editor.client
      .from("company_seals")
      .insert({ company_id: companyId, name: "Sello X", storage_path: "x/x.png" })
      .select()
      .single();

    expect(error).toBeNull();
    sealId = data!.id;

    const { data: readBack, error: readError } = await editor.client
      .from("company_seals")
      .select("*")
      .eq("id", sealId);

    expect(readError).toBeNull();
    expect(readBack).toHaveLength(1);
  });
});

describe("user_signatures RLS", () => {
  let owner: TestUser | undefined;
  let otherUser: TestUser | undefined;
  let signatureId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (signatureId) await admin.from("user_signatures").delete().eq("id", signatureId);
    if (owner) await deleteTestUser(owner.id);
    if (otherUser) await deleteTestUser(otherUser.id);
    owner = undefined;
    otherUser = undefined;
    signatureId = "";
  });

  it("lets any authenticated user (regardless of module permission) save their own signature", async () => {
    owner = await createTestUser("Viewer");
    await assignModulePermission(owner.id, false); // no document_stamps access at all

    const { data, error } = await owner.client
      .from("user_signatures")
      .insert({ user_id: owner.id, storage_path: `${owner.id}/firma_1.png` })
      .select()
      .single();

    expect(error).toBeNull();
    signatureId = data!.id;
  });

  it("blocks a user from reading another user's signature", async () => {
    owner = await createTestUser("Viewer");
    otherUser = await createTestUser("Viewer");

    const { data } = await owner.client
      .from("user_signatures")
      .insert({ user_id: owner.id, storage_path: `${owner.id}/firma_1.png` })
      .select()
      .single();
    signatureId = data!.id;

    const { data: otherView, error } = await otherUser.client
      .from("user_signatures")
      .select("*")
      .eq("id", signatureId);

    expect(error).toBeNull();
    expect(otherView).toEqual([]);
  });
});
