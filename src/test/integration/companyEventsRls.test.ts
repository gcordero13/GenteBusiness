import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("company_events RLS", () => {
  let viewer: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    admin = undefined;
  });

  it("lets any authenticated user read company_events", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.from("company_events").select("*");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("blocks a Viewer (no can_manage_platform) from creating an event", async () => {
    viewer = await createTestUser("Viewer");

    const { error } = await viewer.client
      .from("company_events")
      .insert({ name: "Should Fail Event", event_date: "2030-01-01" });

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin create an event", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("company_events")
      .insert({ name: `Test Event ${admin.id}`, event_date: "2030-01-01" })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.name).toContain("Test Event");

    const adminClient = createAdminClient();
    await adminClient.from("company_events").delete().eq("id", data!.id);
  });
});
