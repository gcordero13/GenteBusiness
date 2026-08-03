import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMaintenanceBasicCsv, type MaintenanceReportRow } from "@/lib/maintenanceReportCsv";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const yearParam = url.searchParams.get("year");

  let query = supabase
    .from("maintenance_records")
    .select(
      "type, first_name, last_name, company_name, department_name, status, created_at, app_users(full_name, email), maintenance_surveys(status)",
    );
  if (typeParam === "preventivo" || typeParam === "correctivo") {
    query = query.eq("type", typeParam);
  }
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    const year = Number(yearParam);
    query = query.gte("created_at", `${year}-01-01T00:00:00.000Z`).lt("created_at", `${year + 1}-01-01T00:00:00.000Z`);
  }

  const { data: records } = await query.order("created_at", { ascending: false });

  const rows: MaintenanceReportRow[] = (records ?? []).map((r) => {
    const tech = r.app_users as unknown as { full_name: string | null; email: string } | null;
    const survey = r.maintenance_surveys as unknown as { status: string } | { status: string }[] | null;
    const surveyStatus = Array.isArray(survey) ? survey[0]?.status : survey?.status;
    return {
      type: r.type,
      first_name: r.first_name,
      last_name: r.last_name,
      company_name: r.company_name,
      department_name: r.department_name,
      technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
      status: r.status,
      created_at: r.created_at,
      completed_at: null,
      email: null,
      position: null,
      host_name: null,
      ram: null,
      os: null,
      storage_total: null,
      storage_used: null,
      storage_free: null,
      checklist: {},
      correctivo: {},
      findings: null,
      observations: null,
      technician_signed_at: null,
      user_signed_at: null,
      survey_completed: surveyStatus === "respondida",
      quality_score: null,
      professionalism_score: null,
      clarity_score: null,
      satisfaction_score: null,
      survey_comments: null,
    };
  });

  const csv = buildMaintenanceBasicCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mantenimientos-basico.csv"`,
    },
  });
}
