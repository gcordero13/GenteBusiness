import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessToday, formatMonthDay } from "@/lib/contacts";
import { getEffectiveSchedule, formatScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import {
  buildDailyAttendanceRows,
  buildAttendancePeriodRows,
  summarizeAttendancePeriod,
  classifyPuntualidadLabel,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  formatArrivalTime,
  type DailyArrival,
  type ApprovedLeaveRange,
} from "@/lib/attendance";
import { PonchadorDashboard, type PonchadorRow, type PonchadorSummary } from "./PonchadorDashboard";

const EARLY_DEPARTURE_THRESHOLD_MINUTES = 15;

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const ESTADO_LABELS: Record<PonchadorRow["estado"], string> = {
  puntual: "Puntual",
  llegada_tarde: "Llegada tarde",
  salida_anticipada: "Salida anticipada",
  ausente: "Ausente",
  permiso: "Permiso",
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}h ${minutes}m`;
}

export default async function PonchadorPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
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
    .select("first_name, hikvision_employee_no, schedule_id, department_id")
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
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  const params = await searchParams;
  const requestedYear = Number(params.year);
  const requestedMonth = Number(params.month);
  const isValidRequestedPeriod =
    Number.isInteger(requestedYear) &&
    Number.isInteger(requestedMonth) &&
    requestedMonth >= 1 &&
    requestedMonth <= 12 &&
    (requestedYear < currentYear || (requestedYear === currentYear && requestedMonth <= currentMonth));
  const year = isValidRequestedPeriod ? requestedYear : currentYear;
  const month = isValidRequestedPeriod ? requestedMonth : currentMonth;

  const periodStartIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = lastDayOfMonth(year, month);
  const periodEndIsoUnclamped = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const periodEndIso = year === currentYear && month === currentMonth ? todayIso : periodEndIsoUnclamped;

  const { schedulesById, defaultSchedule } = await getScheduleTemplatesContext();
  const { data: departments } = await supabase.from("departments").select("id, default_schedule_id");
  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));
  const viewerSchedule = getEffectiveSchedule(
    myContact.schedule_id,
    myContact.department_id ? departmentDefaultById.get(myContact.department_id) : null,
    schedulesById,
    defaultSchedule,
  );

  const windowStartIso = new Date(
    new Date(`${periodStartIso}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEndIso = new Date(
    new Date(`${periodEndIsoUnclamped}T00:00:00.000Z`).getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Scoped by the time_clock_punches_select_own RLS policy (contact_id-based) -
  // see "Data Access" in docs/superpowers/specs/2026-08-12-ponchador-module-design.md.
  const { data: punches } = await supabase
    .from("time_clock_punches")
    .select("punched_at")
    .gte("punched_at", windowStartIso)
    .lt("punched_at", windowEndIso);

  const arrivalsAndExits = buildDailyAttendanceRows((punches ?? []).map((p) => p.punched_at));

  // requester_app_user_id filter is required: vacation_requests_select's RLS
  // also lets a supervisor/RRHH-authorized viewer see OTHER people's
  // requests - without this filter we could misattribute someone else's
  // approved leave to this page's viewer.
  const { data: leaveRequests } = await supabase
    .from("vacation_requests")
    .select("date_from, date_to")
    .eq("requester_app_user_id", user!.id)
    .eq("status", "aprobado")
    .lte("date_from", periodEndIso)
    .gte("date_to", periodStartIso);

  const approvedLeave: ApprovedLeaveRange[] = (leaveRequests ?? []).map((r) => ({
    dateFrom: r.date_from,
    dateTo: r.date_to,
  }));

  const periodRows = buildAttendancePeriodRows(
    periodStartIso,
    periodEndIso,
    viewerSchedule,
    arrivalsAndExits,
    approvedLeave,
    EARLY_DEPARTURE_THRESHOLD_MINUTES,
  );
  const summary = summarizeAttendancePeriod(periodRows);
  const puntualidadTierLabel = classifyPuntualidadLabel(summary.puntualidadPercent);

  const periodArrivals: DailyArrival[] = periodRows
    .filter((r): r is typeof r & { arrivalMinutes: number } => r.arrivalMinutes !== null)
    .map((r) => ({ dateIso: r.dateIso, arrivalMinutes: r.arrivalMinutes }));
  const comparison = attachScheduleComparison(periodArrivals, viewerSchedule);
  const avgMinutesEarly = averageMinutesEarly(comparison);

  let motivationalPhrase: string | null = null;
  let averageArrivalDeltaLabel: string | null = null;
  if (avgMinutesEarly !== null) {
    const tier = classifyArrivalTier(avgMinutesEarly, viewerSchedule.tolerance_minutes);
    motivationalPhrase = pickMotivationalPhrase(tier, myContact.first_name, today.getUTCDate());
    const roundedDelta = Math.round(Math.abs(avgMinutesEarly));
    averageArrivalDeltaLabel = `${roundedDelta} min ${avgMinutesEarly >= 0 ? "temprano" : "tarde"}`;
  }

  const ponchadorRows: PonchadorRow[] = periodRows.map((r) => ({
    dateIso: r.dateIso,
    dateLabel: formatMonthDay(r.dateIso),
    arrivalLabel: r.arrivalMinutes === null ? null : formatArrivalTime(r.arrivalMinutes),
    exitLabel: r.exitMinutes === null ? null : formatArrivalTime(r.exitMinutes),
    workedLabel: r.workedMinutes === null ? null : formatHoursMinutes(r.workedMinutes),
    estado: r.estado,
    estadoLabel: ESTADO_LABELS[r.estado],
    observacion: r.observacion,
  }));

  const summaryDisplay: PonchadorSummary = {
    diasHabiles: summary.diasHabiles,
    diasTrabajados: summary.diasTrabajados,
    puntuales: summary.puntuales,
    llegadasTarde: summary.llegadasTarde,
    salidasAnticipadas: summary.salidasAnticipadas,
    ausencias: summary.ausencias,
    permisos: summary.permisos,
    feriados: summary.feriados,
    horasTrabajadasLabel: formatHoursMinutes(summary.horasTrabajadasMinutes),
    promedioDiarioLabel:
      summary.diasTrabajados === 0
        ? "Sin datos"
        : formatHoursMinutes(summary.horasTrabajadasMinutes / summary.diasTrabajados),
  };

  const averageArrivalLabel =
    summary.promedioEntradaMinutes === null ? null : formatArrivalTime(summary.promedioEntradaMinutes);
  const puntualidadLabel =
    summary.puntualidadPercent === null
      ? "Sin datos"
      : `${summary.puntualidadPercent}%${puntualidadTierLabel ? ` · ${puntualidadTierLabel}` : ""}`;
  const diasTrabajadosLabel = `de ${summary.diasHabiles} días hábiles`;
  const periodLabel = `01 ${MONTH_NAMES_ES[month - 1]} - ${periodEndIsoUnclamped.slice(8, 10)} ${MONTH_NAMES_ES[month - 1]}`;
  const scheduleFooterNote = `Tu horario: ${formatScheduleLine(viewerSchedule)}. Tolerancia: ${viewerSchedule.tolerance_minutes} minutos.`;

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
      <PonchadorDashboard
        year={year}
        month={month}
        currentYear={currentYear}
        currentMonth={currentMonth}
        periodLabel={periodLabel}
        averageArrivalLabel={averageArrivalLabel}
        averageArrivalDeltaLabel={averageArrivalDeltaLabel}
        diasTrabajadosLabel={diasTrabajadosLabel}
        puntualidadLabel={puntualidadLabel}
        horasTrabajadasLabel={summaryDisplay.horasTrabajadasLabel}
        rows={ponchadorRows}
        summary={summaryDisplay}
        motivationalPhrase={motivationalPhrase}
        scheduleFooterNote={scheduleFooterNote}
      />
    </div>
  );
}
