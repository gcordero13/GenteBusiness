import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("time_clock_punches RLS - select own", () => {
  let viewer: TestUser | undefined;
  let ownContactId: string | undefined;
  let otherContactId: string | undefined;
  let deviceId: string | undefined;

  afterEach(async () => {
    const admin = createAdminClient();
    if (deviceId) await admin.from("time_clock_punches").delete().eq("device_id", deviceId);
    if (deviceId) await admin.from("time_clock_devices").delete().eq("id", deviceId);
    if (ownContactId) await admin.from("contacts").delete().eq("id", ownContactId);
    if (otherContactId) await admin.from("contacts").delete().eq("id", otherContactId);
    if (viewer) await deleteTestUser(viewer.id);
    viewer = undefined;
    ownContactId = undefined;
    otherContactId = undefined;
    deviceId = undefined;
  });

  it("lets a user select their own contact's punches but not another contact's", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Test Device", ip_address: "192.168.1.1", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({
        first_name: "Own",
        last_name: "Contact",
        email: viewer.email,
        hikvision_employee_no: `own-${viewer.id}`,
      })
      .select()
      .single();
    ownContactId = ownContact!.id;

    const { data: otherContact } = await admin
      .from("contacts")
      .insert({
        first_name: "Other",
        last_name: "Contact",
        hikvision_employee_no: `other-${viewer.id}`,
      })
      .select()
      .single();
    otherContactId = otherContact!.id;

    await admin.from("time_clock_punches").insert([
      {
        device_id: deviceId,
        employee_no_string: `own-${viewer.id}`,
        contact_id: ownContactId,
        punched_at: "2026-08-11T12:00:00.000Z",
      },
      {
        device_id: deviceId,
        employee_no_string: `other-${viewer.id}`,
        contact_id: otherContactId,
        punched_at: "2026-08-11T13:00:00.000Z",
      },
    ]);

    const { data, error } = await viewer.client
      .from("time_clock_punches")
      .select("contact_id")
      .eq("device_id", deviceId);

    expect(error).toBeNull();
    expect(data?.map((d) => d.contact_id)).toEqual([ownContactId]);
  });
});
