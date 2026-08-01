import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMaintenanceDetailedCsv, type MaintenanceReportRow } from "@/lib/maintenanceReportCsv";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";

interface SurveyJoin {
  status: string;
  quality_score: number | null;
  professionalism_score: number | null;
  clarity_score: number | null;
  satisfaction_score: number | null;
  comments: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: records } = await supabase
    .from("maintenance_records")
    .select(
      `first_name, last_name, email, position, company_name, department_name, status, created_at, completed_at,
       host_name, ram, os, storage_total, storage_used, storage_free,
       restore_point_created, temp_files_cleaned, disk_defragmented, antivirus_updated, windows_updated,
       agenda_installed, apps_match_profile, wallpaper_installed, keyboard_cleaned, screen_cleaned,
       findings, observations, technician_signed_at, user_signed_at,
       app_users(full_name, email),
       maintenance_surveys(status, quality_score, professionalism_score, clarity_score, satisfaction_score, comments)`,
    )
    .order("created_at", { ascending: false });

  const rows: MaintenanceReportRow[] = (records ?? []).map((r) => {
    const tech = r.app_users as unknown as { full_name: string | null; email: string } | null;
    const surveyRaw = r.maintenance_surveys as unknown as SurveyJoin | SurveyJoin[] | null;
    const survey = Array.isArray(surveyRaw) ? surveyRaw[0] : surveyRaw;
    return {
      first_name: r.first_name,
      last_name: r.last_name,
      company_name: r.company_name,
      department_name: r.department_name,
      technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      email: r.email,
      position: r.position,
      host_name: r.host_name,
      ram: r.ram,
      os: r.os,
      storage_total: r.storage_total,
      storage_used: r.storage_used,
      storage_free: r.storage_free,
      checklist: {
        restore_point_created: r.restore_point_created,
        temp_files_cleaned: r.temp_files_cleaned,
        disk_defragmented: r.disk_defragmented,
        antivirus_updated: r.antivirus_updated,
        windows_updated: r.windows_updated,
        agenda_installed: r.agenda_installed,
        apps_match_profile: r.apps_match_profile,
        wallpaper_installed: r.wallpaper_installed,
        keyboard_cleaned: r.keyboard_cleaned,
        screen_cleaned: r.screen_cleaned,
      },
      findings: r.findings,
      observations: r.observations,
      technician_signed_at: r.technician_signed_at,
      user_signed_at: r.user_signed_at,
      survey_completed: survey?.status === "respondida",
      quality_score: survey?.quality_score ?? null,
      professionalism_score: survey?.professionalism_score ?? null,
      clarity_score: survey?.clarity_score ?? null,
      satisfaction_score: survey?.satisfaction_score ?? null,
      survey_comments: survey?.comments ?? null,
    };
  });

  const csv = buildMaintenanceDetailedCsv(rows, MAINTENANCE_CHECKLIST_ITEMS);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mantenimientos-detallado.csv"`,
    },
  });
}
