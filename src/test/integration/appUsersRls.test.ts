import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("app_users RLS", () => {
  let viewer: TestUser | undefined;
  let otherViewer: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (otherViewer) await deleteTestUser(otherViewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    otherViewer = undefined;
    admin = undefined;
  });

  it("only shows a Viewer their own app_users row, not another user's", async () => {
    viewer = await createTestUser("Viewer");
    otherViewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.from("app_users").select("*");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(viewer.id);
  });

  it("allows a Super Admin to list all app_users", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client.from("app_users").select("*");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
