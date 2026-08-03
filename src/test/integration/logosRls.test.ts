// @vitest-environment node
//
// jsdom (this project's default test environment) replaces the global
// Blob/File constructors with its own re-implementations. Node's built-in
// fetch (undici) does not recognize those cross-realm objects, so a
// storage.upload() call issued from a jsdom test silently loses the file's
// content-type and gets rejected by the bucket's MIME allowlist. Running
// this file under the plain "node" environment keeps the natives fetch
// already relies on, which is what these storage tests need.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("platform_settings RLS", () => {
  let editor: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (editor) await deleteTestUser(editor.id);
    if (admin) await deleteTestUser(admin.id);
    editor = undefined;
    admin = undefined;

    await createAdminClient().from("platform_settings").update({ logo_url: null }).eq("id", true);
  });

  it("lets an anonymous (unauthenticated) client read the platform settings row", async () => {
    const anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await anon.from("platform_settings").select("logo_url");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("blocks an Editor (no can_manage on settings) from updating the platform logo", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client
      .from("platform_settings")
      .update({ logo_url: "https://example.com/logo.png" })
      .eq("id", true);

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin update the platform logo", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("platform_settings")
      .update({ logo_url: "https://example.com/logo.png" })
      .eq("id", true)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.logo_url).toBe("https://example.com/logo.png");
  });
});

describe("company-logos storage RLS", () => {
  let editor: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (editor) await deleteTestUser(editor.id);
    if (admin) await deleteTestUser(admin.id);
    editor = undefined;
    admin = undefined;
  });

  function fakePng() {
    return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
  }

  it("blocks an Editor (no can_manage on companies) from uploading a company logo", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client.storage
      .from("company-logos")
      .upload(`${randomUUID()}-logo.png`, fakePng());

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin upload a company logo at the bucket root", async () => {
    admin = await createTestUser("Super Admin");
    const path = `${randomUUID()}-logo.png`;

    const { error } = await admin.client.storage.from("company-logos").upload(path, fakePng());

    expect(error).toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });

  it("blocks an Editor from uploading into the platform/ folder", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client.storage
      .from("company-logos")
      .upload(`platform/${randomUUID()}-logo.png`, fakePng());

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin (settings can_manage) upload into the platform/ folder", async () => {
    admin = await createTestUser("Super Admin");
    const path = `platform/${randomUUID()}-logo.png`;

    const { error } = await admin.client.storage.from("company-logos").upload(path, fakePng());

    expect(error).toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });

  it("lets a Super Admin overwrite an existing company logo at the bucket root", async () => {
    admin = await createTestUser("Super Admin");
    const path = `${randomUUID()}-logo.png`;

    await createAdminClient().storage.from("company-logos").upload(path, fakePng());

    const { error } = await admin.client.storage
      .from("company-logos")
      .upload(path, fakePng(), { upsert: true });

    expect(error).toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });

  it("blocks an Editor from overwriting an existing company logo at the bucket root", async () => {
    editor = await createTestUser("Editor");
    const path = `${randomUUID()}-logo.png`;

    await createAdminClient().storage.from("company-logos").upload(path, fakePng());

    const { error } = await editor.client.storage
      .from("company-logos")
      .upload(path, fakePng(), { upsert: true });

    expect(error).not.toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });

  it("lets a Super Admin overwrite an existing logo in the platform/ folder", async () => {
    admin = await createTestUser("Super Admin");
    const path = `platform/${randomUUID()}-logo.png`;

    await createAdminClient().storage.from("company-logos").upload(path, fakePng());

    const { error } = await admin.client.storage
      .from("company-logos")
      .upload(path, fakePng(), { upsert: true });

    expect(error).toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });

  it("blocks an Editor from overwriting an existing logo in the platform/ folder", async () => {
    editor = await createTestUser("Editor");
    const path = `platform/${randomUUID()}-logo.png`;

    await createAdminClient().storage.from("company-logos").upload(path, fakePng());

    const { error } = await editor.client.storage
      .from("company-logos")
      .upload(path, fakePng(), { upsert: true });

    expect(error).not.toBeNull();
    await createAdminClient().storage.from("company-logos").remove([path]);
  });
});
