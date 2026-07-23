import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

// Creates a disposable role profile scoped to this test run, with a custom
// `document_stamps.can_add` value, instead of mutating the real shared
// "Viewer" role profile (which would leak into production if a test crashed
// mid-run or the suite were run with a filter/`.only`).
async function createDocumentStampsProfile(canAdd: boolean) {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("role_profiles")
    .insert({ name: `Document Stamps Test ${Date.now()}-${Math.random().toString(36).slice(2)}` })
    .select()
    .single();
  const profileId = profile!.id as string;

  const { data: moduleRow } = await admin.from("modules").select("id").eq("key", "document_stamps").single();

  await admin.from("role_profile_permissions").insert({
    role_profile_id: profileId,
    module_id: moduleRow!.id,
    can_view: true,
    can_add: canAdd,
    can_edit: canAdd,
    can_delete: false,
    can_deactivate: false,
    can_manage: false,
    can_authorize: false,
  });

  return profileId;
}

async function assignProfile(userId: string, profileId: string) {
  const admin = createAdminClient();
  await admin.from("app_users").update({ role_profile_id: profileId }).eq("id", userId);
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
  let profileId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (sealId) await admin.from("company_seals").delete().eq("id", sealId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (viewer) await deleteTestUser(viewer.id);
    if (editor) await deleteTestUser(editor.id);
    if (profileId) await admin.from("role_profiles").delete().eq("id", profileId);
    viewer = undefined;
    editor = undefined;
    sealId = "";
    profileId = "";
  });

  it("blocks a user without can_add from creating a seal", async () => {
    companyId = await makeCompany();
    profileId = await createDocumentStampsProfile(false);
    viewer = await createTestUser("Viewer");
    await assignProfile(viewer.id, profileId);

    const { error } = await viewer.client
      .from("company_seals")
      .insert({ company_id: companyId, name: "Sello X", storage_path: "x/x.png" });

    expect(error).not.toBeNull();
  });

  it("lets a user with can_add create and read a seal", async () => {
    companyId = await makeCompany();
    profileId = await createDocumentStampsProfile(true);
    editor = await createTestUser("Viewer");
    await assignProfile(editor.id, profileId);

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

  it("blocks a direct storage upload to company-seals without can_add", async () => {
    profileId = await createDocumentStampsProfile(false);
    viewer = await createTestUser("Viewer");
    await assignProfile(viewer.id, profileId);

    const file = new Blob(["not-a-real-seal-image"], { type: "image/png" });
    const { error } = await viewer.client.storage
      .from("company-seals")
      .upload(`${viewer.id}/test-seal.png`, file);

    expect(error).not.toBeNull();
  });
});

describe("user_signatures RLS", () => {
  let owner: TestUser | undefined;
  let otherUser: TestUser | undefined;
  let signatureId: string;
  let profileId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (signatureId) await admin.from("user_signatures").delete().eq("id", signatureId);
    if (owner) await deleteTestUser(owner.id);
    if (otherUser) await deleteTestUser(otherUser.id);
    if (profileId) await admin.from("role_profiles").delete().eq("id", profileId);
    owner = undefined;
    otherUser = undefined;
    signatureId = "";
    profileId = "";
  });

  it("lets any authenticated user (regardless of module permission) save their own signature", async () => {
    // no document_stamps access at all — user_signatures RLS is owner-only
    // and must not depend on the document_stamps module permission.
    profileId = await createDocumentStampsProfile(false);
    owner = await createTestUser("Viewer");
    await assignProfile(owner.id, profileId);

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
