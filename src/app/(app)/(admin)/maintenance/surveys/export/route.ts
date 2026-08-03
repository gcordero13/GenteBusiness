import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSurveysCsv } from "@/lib/maintenanceSurveysCsv";

export async function GET() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "maintenance",
  });
  if (!flagsRows?.[0]?.can_view) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: surveys } = await supabase
    .from("maintenance_surveys")
    .select(
      "quality_score, professionalism_score, clarity_score, satisfaction_score, comments, responded_at, app_users(full_name, email), maintenance_records(first_name, last_name)",
    )
    .eq("status", "respondida")
    .order("responded_at", { ascending: false });

  const rows = (surveys ?? []).map((s) => {
    const tech = s.app_users as unknown as { full_name: string | null; email: string } | null;
    const record = s.maintenance_records as unknown as { first_name: string; last_name: string } | null;
    return {
      first_name: record?.first_name ?? "-",
      last_name: record?.last_name ?? "",
      technician_name: tech?.full_name ?? tech?.email ?? "Desconocido",
      quality_score: s.quality_score,
      professionalism_score: s.professionalism_score,
      clarity_score: s.clarity_score,
      satisfaction_score: s.satisfaction_score,
      comments: s.comments,
      responded_at: s.responded_at,
    };
  });

  const csv = buildSurveysCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="encuestas-mantenimiento.csv"`,
    },
  });
}
