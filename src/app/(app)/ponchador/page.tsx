import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessToday, formatMonthDay } from "@/lib/contacts";
import {
  buildDailyAttendanceRows,
  averageArrivalMinutes,
  formatArrivalTime,
  type DailyArrival,
} from "@/lib/attendance";
import { PonchadorDashboard, type PonchadorRow } from "./PonchadorDashboard";

export default async function PonchadorPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "ponchador",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myContact } = await supabase
    .from("contacts")
    .select("hikvision_employee_no")
    .eq("email", user!.email!)
    .maybeSingle();

  if (!myContact?.hikvision_employee_no) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
        <p className="text-sm text-muted-foreground">No tienes código de ponchador asignado.</p>
      </div>
    );
  }

  const today = getBusinessToday();
  const todayIso = today.toISOString().slice(0, 10);
  const monthStartIso = `${todayIso.slice(0, 7)}-01`;
  const windowStartIso = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

  const { data: punches } = await supabase
    .from("time_clock_punches")
    .select("punched_at")
    .gte("punched_at", windowStartIso);

  const allRows = buildDailyAttendanceRows((punches ?? []).map((p) => p.punched_at));
  const monthlyRows = allRows.filter((r) => r.dateIso >= monthStartIso);

  const monthlyArrivals: DailyArrival[] = monthlyRows
    .filter((r): r is typeof r & { arrivalMinutes: number } => r.arrivalMinutes !== null)
    .map((r) => ({ dateIso: r.dateIso, arrivalMinutes: r.arrivalMinutes }));
  const avgArrivalMinutes = averageArrivalMinutes(monthlyArrivals);

  const rows: PonchadorRow[] = monthlyRows.map((r) => ({
    dateIso: r.dateIso,
    dateLabel: formatMonthDay(r.dateIso),
    arrivalLabel: r.arrivalMinutes === null ? null : formatArrivalTime(r.arrivalMinutes),
    exitLabel: r.exitMinutes === null ? null : formatArrivalTime(r.exitMinutes),
  }));

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
      <PonchadorDashboard
        averageArrivalLabel={avgArrivalMinutes === null ? null : formatArrivalTime(avgArrivalMinutes)}
        rows={rows}
      />
    </div>
  );
}
