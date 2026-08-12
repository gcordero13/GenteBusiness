import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("schedule_templates / schedule_template_days RLS and constraints", () => {
  let viewer: TestUser | undefined;
  let admin: TestUser | undefined;
  let createdScheduleId: string | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    admin = undefined;

    if (createdScheduleId) {
      const adminClient = createAdminClient();
      await adminClient.from("schedule_templates").delete().eq("id", createdScheduleId);
      createdScheduleId = undefined;
    }
  });

  it("lets any authenticated user read schedule_templates and schedule_template_days", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.from("schedule_templates").select("*");
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const { error: daysError } = await viewer.client.from("schedule_template_days").select("*");
    expect(daysError).toBeNull();
  });

  it("blocks a Viewer from inserting a schedule template", async () => {
    viewer = await createTestUser("Viewer");

    const { error } = await viewer.client
      .from("schedule_templates")
      .insert({ name: `Should Fail ${crypto.randomUUID()}`, tolerance_minutes: 0 });

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin insert a schedule template", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("schedule_templates")
      .insert({ name: `Test Schedule ${admin.id}`, tolerance_minutes: 0 })
      .select()
      .single();

    expect(error).toBeNull();
    createdScheduleId = data?.id;
  });

  it("rejects a second row with is_default = true", async () => {
    const adminClient = createAdminClient();
    const { data: created, error: createError } = await adminClient
      .from("schedule_templates")
      .insert({ name: `Test Second Default ${crypto.randomUUID()}`, tolerance_minutes: 0, is_default: true })
      .select()
      .single();

    expect(createError).not.toBeNull();
    createdScheduleId = created?.id;
  });

  it("deleting a schedule that a department references sets that department's default_schedule_id to null", async () => {
    const adminClient = createAdminClient();
    const { data: schedule } = await adminClient
      .from("schedule_templates")
      .insert({ name: `Test Cascade ${crypto.randomUUID()}`, tolerance_minutes: 0 })
      .select()
      .single();
    createdScheduleId = schedule!.id;

    const { data: company } = await adminClient
      .from("companies")
      .insert({ name: `Test Co ${crypto.randomUUID()}` })
      .select()
      .single();
    const { data: department } = await adminClient
      .from("departments")
      .insert({ name: `Test Dept ${crypto.randomUUID()}`, company_id: company!.id, default_schedule_id: schedule!.id })
      .select()
      .single();

    await adminClient.from("schedule_templates").delete().eq("id", schedule!.id);
    createdScheduleId = undefined;

    const { data: reloadedDepartment } = await adminClient
      .from("departments")
      .select("default_schedule_id")
      .eq("id", department!.id)
      .single();
    expect(reloadedDepartment?.default_schedule_id).toBeNull();

    await adminClient.from("departments").delete().eq("id", department!.id);
    await adminClient.from("companies").delete().eq("id", company!.id);
  });

  it("deleting a schedule also deletes its schedule_template_days rows (cascade)", async () => {
    const adminClient = createAdminClient();
    const { data: schedule } = await adminClient
      .from("schedule_templates")
      .insert({ name: `Test Days Cascade ${crypto.randomUUID()}`, tolerance_minutes: 0 })
      .select()
      .single();
    const scheduleId = schedule!.id;

    await adminClient
      .from("schedule_template_days")
      .insert({ schedule_template_id: scheduleId, day_of_week: 1, start_time: "08:00", end_time: "17:00" });

    await adminClient.from("schedule_templates").delete().eq("id", scheduleId);

    const { data: remainingDays } = await adminClient
      .from("schedule_template_days")
      .select("*")
      .eq("schedule_template_id", scheduleId);
    expect(remainingDays).toEqual([]);
  });
});
