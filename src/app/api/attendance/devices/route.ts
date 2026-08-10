import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedAgentRequest } from "../auth";

export async function GET(request: NextRequest) {
  if (!isAuthorizedAgentRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: devices, error } = await admin
    .from("time_clock_devices")
    .select("id, name, ip_address, username, password")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ devices: devices ?? [] });
}
