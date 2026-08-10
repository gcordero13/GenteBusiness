import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/api/attendance/devices/route";

const SECRET = "test-secret-for-attendance-devices";
process.env.ATTENDANCE_AGENT_SECRET = SECRET;

function makeRequest(authHeader: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;
  return new NextRequest("http://localhost/api/attendance/devices", { headers });
}

describe("GET /api/attendance/devices", () => {
  let activeId: string;
  let inactiveId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (activeId) await admin.from("time_clock_devices").delete().eq("id", activeId);
    if (inactiveId) await admin.from("time_clock_devices").delete().eq("id", inactiveId);
    activeId = "";
    inactiveId = "";
  });

  it("rejects a request with no Authorization header", async () => {
    const response = await GET(makeRequest(null));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await GET(makeRequest("Bearer wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns only active devices, including credentials", async () => {
    const admin = createAdminClient();
    const { data: active } = await admin
      .from("time_clock_devices")
      .insert({
        name: "Entrada Activa",
        ip_address: "192.168.1.10",
        username: "admin",
        password: "secret",
        is_active: true,
      })
      .select()
      .single();
    activeId = active!.id;
    const { data: inactive } = await admin
      .from("time_clock_devices")
      .insert({
        name: "Entrada Inactiva",
        ip_address: "192.168.1.11",
        username: "admin",
        password: "secret",
        is_active: false,
      })
      .select()
      .single();
    inactiveId = inactive!.id;

    const response = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.devices).toContainEqual({
      id: activeId,
      name: "Entrada Activa",
      ip_address: "192.168.1.10",
      username: "admin",
      password: "secret",
    });
    expect(body.devices.find((d: { id: string }) => d.id === inactiveId)).toBeUndefined();
  });
});
