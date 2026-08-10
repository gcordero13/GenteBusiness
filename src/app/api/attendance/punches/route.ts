import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedAgentRequest } from "../auth";

interface IncomingPunch {
  device_id: string;
  employee_no_string: string;
  punched_at: string;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAgentRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { punches?: IncomingPunch[] };
  const punches = body.punches ?? [];
  if (punches.length === 0) {
    return NextResponse.json({ synced: [] });
  }

  const admin = createAdminClient();

  const employeeNumbers = Array.from(new Set(punches.map((p) => p.employee_no_string)));
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, hikvision_employee_no")
    .in("hikvision_employee_no", employeeNumbers);

  const contactByEmployeeNo = new Map(
    (contacts ?? []).map((c) => [c.hikvision_employee_no as string, c.id as string]),
  );

  const rowsByConflictKey = new Map(
    punches.map((p) => [
      `${p.device_id}:${p.employee_no_string}:${p.punched_at}`,
      {
        device_id: p.device_id,
        employee_no_string: p.employee_no_string,
        punched_at: p.punched_at,
        contact_id: contactByEmployeeNo.get(p.employee_no_string) ?? null,
      },
    ]),
  );
  const rows = Array.from(rowsByConflictKey.values());

  const { data: upserted, error } = await admin
    .from("time_clock_punches")
    .upsert(rows, { onConflict: "device_id,employee_no_string,punched_at" })
    .select("device_id, employee_no_string, punched_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: upserted ?? [] });
}
