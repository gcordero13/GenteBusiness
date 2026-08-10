import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/attendance/punches/route";

const SECRET = "test-secret-for-attendance-punches";
process.env.ATTENDANCE_AGENT_SECRET = SECRET;

function makeRequest(body: unknown, authHeader: string | null): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;
  return new NextRequest("http://localhost/api/attendance/punches", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/attendance/punches", () => {
  let deviceId: string;
  let contactId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (deviceId) await admin.from("time_clock_punches").delete().eq("device_id", deviceId);
    if (deviceId) await admin.from("time_clock_devices").delete().eq("id", deviceId);
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    deviceId = "";
    contactId = "";
  });

  it("rejects a request with a missing Authorization header", async () => {
    const response = await POST(makeRequest({ punches: [] }, null));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(makeRequest({ punches: [] }, "Bearer wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("stores a punch with contact_id null when no contact matches the employee number", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const response = await POST(
      makeRequest(
        { punches: [{ device_id: deviceId, employee_no_string: "999", punched_at: "2026-08-10T08:00:00.000Z" }] },
        `Bearer ${SECRET}`,
      ),
    );
    expect(response.status).toBe(200);

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("contact_id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "999")
      .single();
    expect(stored?.contact_id).toBeNull();
  });

  it("resolves contact_id when a contact's hikvision_employee_no matches", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({ first_name: "Test", last_name: "Employee", hikvision_employee_no: "555" })
      .select()
      .single();
    contactId = contact!.id;

    const response = await POST(
      makeRequest(
        { punches: [{ device_id: deviceId, employee_no_string: "555", punched_at: "2026-08-10T08:00:00.000Z" }] },
        `Bearer ${SECRET}`,
      ),
    );
    expect(response.status).toBe(200);

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("contact_id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "555")
      .single();
    expect(stored?.contact_id).toBe(contactId);
  });

  it("is idempotent when the same punch is posted twice", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const punch = { device_id: deviceId, employee_no_string: "999", punched_at: "2026-08-10T08:00:00.000Z" };
    await POST(makeRequest({ punches: [punch] }, `Bearer ${SECRET}`));
    await POST(makeRequest({ punches: [punch] }, `Bearer ${SECRET}`));

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "999");
    expect(stored).toHaveLength(1);
  });

  it("dedupes duplicate conflict keys within a single batch instead of erroring", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const punch = { device_id: deviceId, employee_no_string: "999", punched_at: "2026-08-10T08:00:00.000Z" };
    const response = await POST(makeRequest({ punches: [punch, punch] }, `Bearer ${SECRET}`));
    expect(response.status).toBe(200);

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "999");
    expect(stored).toHaveLength(1);
  });

  it("resolves contact_id independently for each employee number in a multi-punch batch", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({ first_name: "Test", last_name: "Employee", hikvision_employee_no: "555" })
      .select()
      .single();
    contactId = contact!.id;

    const response = await POST(
      makeRequest(
        {
          punches: [
            { device_id: deviceId, employee_no_string: "555", punched_at: "2026-08-10T08:00:00.000Z" },
            { device_id: deviceId, employee_no_string: "999", punched_at: "2026-08-10T09:00:00.000Z" },
          ],
        },
        `Bearer ${SECRET}`,
      ),
    );
    expect(response.status).toBe(200);

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("employee_no_string, contact_id")
      .eq("device_id", deviceId)
      .order("employee_no_string");
    expect(stored).toEqual([
      { employee_no_string: "555", contact_id: contactId },
      { employee_no_string: "999", contact_id: null },
    ]);
  });
});
