import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

const DEFAULT_SCHEDULE = {
  start_time: "08:00:00",
  end_time: "17:00:00",
  workdays: [1, 2, 3, 4, 5],
  tolerance_minutes: 0,
};

describe("company_schedule RLS", () => {
  let viewer: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    admin = undefined;

    // company_schedule is a permanent singleton row, not a row this suite
    // creates and tears down - reset it after every test so a mutation in
    // one test can't leak into another.
    const adminClient = createAdminClient();
    await adminClient.from("company_schedule").update(DEFAULT_SCHEDULE).eq("id", true);
  });

  it("lets any authenticated user read company_schedule", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client
      .from("company_schedule")
      .select("*")
      .eq("id", true)
      .single();

    expect(error).toBeNull();
    expect(data?.start_time).toBe(DEFAULT_SCHEDULE.start_time);
  });

  it("blocks a Viewer (no schedules can_manage) from updating company_schedule", async () => {
    viewer = await createTestUser("Viewer");

    // The update/select policies are symmetric (both require can_manage), so
    // Postgres RLS filters the row out of the update's target set silently -
    // 0 rows affected, no error - rather than raising a permission error.
    // Verify via a follow-up admin read instead of asserting on `error`.
    await viewer.client.from("company_schedule").update({ tolerance_minutes: 5 }).eq("id", true);

    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("company_schedule")
      .select("tolerance_minutes")
      .eq("id", true)
      .single();
    expect(data?.tolerance_minutes).toBe(DEFAULT_SCHEDULE.tolerance_minutes);
  });

  it("lets a Super Admin update company_schedule", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("company_schedule")
      .update({ tolerance_minutes: 10 })
      .eq("id", true)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.tolerance_minutes).toBe(10);
  });
});
