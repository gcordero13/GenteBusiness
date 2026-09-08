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
  buildAttendanceGridDays,
  type DailyArrival,
  type ApprovedLeaveRange,
} from "@/lib/attendance";
import { PonchadorDashboard, type PonchadorRow, type PonchadorSummary } from "./PonchadorDashboard";
import { PonchadorScopeTabs, type PonchadorScope } from "./PonchadorScopeTabs";
import { PonchadorPersonSelector, type PonchadorPersonOption } from "./PonchadorPersonSelector";
import { PonchadorOverviewTable, type PonchadorGridPersonRow } from "./PonchadorOverviewTable";
import { PonchadorDepartmentFilter } from "./PonchadorDepartmentFilter";
import { PonchadorRosterScopeToggle, type PonchadorRosterScope } from "./PonchadorRosterScopeToggle";
import { PeriodFilter } from "./PeriodFilter";

const EARLY_DEPARTURE_THRESHOLD_MINUTES = 15;

const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Indexed by Date.getUTCDay(): 0=domingo..6=sábado.
const WEEKDAY_INITIALS_ES = ["D", "L", "M", "M", "J", "V", "S"];

const ESTADO_LABELS: Record<PonchadorRow["estado"], string> = {
  puntual: "Puntual",
  llegada_tarde: "Llegada tarde",
  salida_anticipada: "Salida anticipada",
  ausente: "Ausente",
  permiso: "Permiso",
};

interface PonchadorRosterPerson {
  id: string;
  name: string;
  departmentName: string | null;
  scheduleId: string | null;
  departmentId: string | null;
}

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
  searchParams: Promise<{
    year?: string;
    month?: string;
    view?: string;
    contactId?: string;
    rosterScope?: string;
    department?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "ponchador",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }
  const canViewAll = flagsRows[0].can_manage ?? false;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Independent of each other: the own-contact lookup only needs the
  // already-resolved user email, and both list_* RPCs derive the caller
  // from auth.uid() server-side (list_all_ponchador_contacts itself returns
  // an empty array when the caller lacks can_manage, so it's safe to always
  // call it here rather than gating the fetch on canViewAll).
  const [{ data: myContactRow }, { data: teamRows }, { data: allRows }] = await Promise.all([
    supabase.from("contacts").select("id, hikvision_employee_no").eq("email", user!.email!).maybeSingle(),
    supabase.rpc("list_my_ponchador_team"),
    supabase.rpc("list_all_ponchador_contacts"),
  ]);

  if (!myContactRow?.hikvision_employee_no) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
        <p className="text-sm text-muted-foreground">No tienes código de ponchador asignado.</p>
      </div>
    );
  }
  const myContactId: string = myContactRow.id;

  const team: PonchadorPersonOption[] = (teamRows ?? []).map(
    (r: { id: string; first_name: string; last_name: string }) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
    }),
  );
  const hasTeam = team.length > 0;

  let allPeople: PonchadorPersonOption[] = [];
  if (canViewAll) {
    allPeople = (allRows ?? []).map(
      (r: { id: string; first_name: string; last_name: string; department_name: string | null }) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        departmentName: r.department_name,
      }),
    );
  }

  // Same rows list_my_ponchador_team/list_all_ponchador_contacts already
  // fetched above, remapped with the schedule_id/department_id fields the
  // Vista general roster needs - no additional RPC calls required.
  const teamRoster: PonchadorRosterPerson[] = (teamRows ?? []).map(
    (r: { id: string; first_name: string; last_name: string; schedule_id: string | null; department_id: string | null }) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      departmentName: null,
      scheduleId: r.schedule_id,
      departmentId: r.department_id,
    }),
  );

  const allRoster: PonchadorRosterPerson[] = canViewAll
    ? (allRows ?? []).map(
        (r: {
          id: string;
          first_name: string;
          last_name: string;
          department_name: string | null;
          schedule_id: string | null;
          department_id: string | null;
        }) => ({
          id: r.id,
          name: `${r.first_name} ${r.last_name}`.trim(),
          departmentName: r.department_name,
          scheduleId: r.schedule_id,
          departmentId: r.department_id,
        }),
      )
    : [];

  const params = await searchParams;
  const requestedScope = params.view;
  const scope: PonchadorScope =
    requestedScope === "team" && hasTeam
      ? "team"
      : requestedScope === "all" && canViewAll
        ? "all"
        : requestedScope === "overview" && (hasTeam || canViewAll)
          ? "overview"
          : "self";

  const targetContactId: string | null = scope === "self" ? myContactId : (params.contactId ?? null);

  const today = getBusinessToday();
  const todayIso = today.toISOString().slice(0, 10);
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

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

  // Moved up from later in the file: both the "overview" branch below and
  // the existing single-person branch need these, so they're computed once
  // here rather than twice.
  const windowStartIso = new Date(
    new Date(`${periodStartIso}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEndIso = new Date(
    new Date(`${periodEndIsoUnclamped}T00:00:00.000Z`).getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const scopeTabs = <PonchadorScopeTabs scope={scope} hasTeam={hasTeam} canViewAll={canViewAll} />;

  function pageHeader(title: string) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {scopeTabs}
      </div>
    );
  }

  if (scope === "overview") {
    const rosterScope: PonchadorRosterScope =
      params.rosterScope === "all" && canViewAll
        ? "all"
        : params.rosterScope === "team" && hasTeam
          ? "team"
          : hasTeam
            ? "team"
            : "all";

    const roster = rosterScope === "team" ? teamRoster : allRoster;

    const selectedDepartment = rosterScope === "all" ? (params.department ?? null) : null;
    const departmentNames = Array.from(
      new Set(allRoster.map((p) => p.departmentName).filter((d): d is string => !!d)),
    ).sort();

    const filteredRoster =
      rosterScope === "all" && selectedDepartment
        ? roster.filter((p) => p.departmentName === selectedDepartment)
        : roster;

    const [{ schedulesById, defaultSchedule }, { data: departments }, { data: rosterPunchRows }, { data: rosterLeaveRows }] =
      await Promise.all([
        getScheduleTemplatesContext(),
        supabase.from("departments").select("id, default_schedule_id"),
        rosterScope === "team"
          ? supabase.rpc("get_ponchador_team_punches", { p_from: windowStartIso, p_to: windowEndIso })
          : supabase.rpc("get_ponchador_all_punches", { p_from: windowStartIso, p_to: windowEndIso }),
        rosterScope === "team"
          ? supabase.rpc("get_ponchador_team_approved_leave", {
              p_period_start: periodStartIso,
              p_period_end: periodEndIso,
            })
          : supabase.rpc("get_ponchador_all_approved_leave", {
              p_period_start: periodStartIso,
              p_period_end: periodEndIso,
            }),
      ]);

    const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));

    const punchesByContact = new Map<string, string[]>();
    for (const p of rosterPunchRows ?? []) {
      const list = punchesByContact.get(p.contact_id) ?? [];
      list.push(p.punched_at);
      punchesByContact.set(p.contact_id, list);
    }

    const leaveByContact = new Map<string, { vacaciones: ApprovedLeaveRange[]; permiso: ApprovedLeaveRange[] }>();
    for (const l of rosterLeaveRows ?? []) {
      const entry = leaveByContact.get(l.contact_id) ?? { vacaciones: [], permiso: [] };
      const range: ApprovedLeaveRange = { dateFrom: l.date_from, dateTo: l.date_to };
      if (l.tipo === "permiso") {
        entry.permiso.push(range);
      } else {
        entry.vacaciones.push(range);
      }
      leaveByContact.set(l.contact_id, entry);
    }

    // Only show a day-of-week column at all if at least one visible person's
    // effective schedule actually includes it - keeps the shared table from
    // wasting columns on e.g. weekends when everyone visible works Mon-Fri,
    // while still surfacing a day (blank for people who don't work it) if
    // even one visible person's schedule covers it.
    const workedWeekdays = new Set<number>();
    for (const person of filteredRoster) {
      const personSchedule = getEffectiveSchedule(
        person.scheduleId,
        person.departmentId ? departmentDefaultById.get(person.departmentId) : null,
        schedulesById,
        defaultSchedule,
      );
      for (const scheduledDay of personSchedule.days) {
        workedWeekdays.add(scheduledDay.day_of_week);
      }
    }

    const gridRows: PonchadorGridPersonRow[] = filteredRoster
      .map((person) => {
        const personSchedule = getEffectiveSchedule(
          person.scheduleId,
          person.departmentId ? departmentDefaultById.get(person.departmentId) : null,
          schedulesById,
          defaultSchedule,
        );
        const personArrivalsAndExits = buildDailyAttendanceRows(punchesByContact.get(person.id) ?? []);
        const personLeave = leaveByContact.get(person.id) ?? { vacaciones: [], permiso: [] };

        const gridDays = buildAttendanceGridDays(
          periodStartIso,
          periodEndIsoUnclamped,
          todayIso,
          personSchedule,
          personArrivalsAndExits,
          personLeave.vacaciones,
          personLeave.permiso,
        );

        const personPeriodRows = buildAttendancePeriodRows(
          periodStartIso,
          periodEndIso,
          personSchedule,
          personArrivalsAndExits,
          [...personLeave.vacaciones, ...personLeave.permiso],
          EARLY_DEPARTURE_THRESHOLD_MINUTES,
        );
        const personSummary = summarizeAttendancePeriod(personPeriodRows);
        const personPuntualidadTier = classifyPuntualidadLabel(personSummary.puntualidadPercent);

        return {
          contactId: person.id,
          name: person.name,
          puntualidadLabel:
            personSummary.puntualidadPercent === null
              ? "Sin datos"
              : `${personSummary.puntualidadPercent}%${personPuntualidadTier ? ` · ${personPuntualidadTier}` : ""}`,
          href: `/ponchador?view=${rosterScope}&contactId=${person.id}&year=${year}&month=${month}`,
          days: gridDays.map((d) => ({
            dayNumber: d.dayNumber,
            arrivalLabel: d.arrivalLabel,
            exitLabel: d.exitLabel,
            status: d.status,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // getUTCDay(): 0=domingo..6=sábado - matches the standard L M M J V S D
    // reading order Spanish calendars use, despite Monday/Wednesday both
    // starting with "M".
    const dayNumbers = Array.from({ length: lastDayOfMonth(year, month) }, (_, i) => i + 1).filter((day) =>
      workedWeekdays.has(new Date(Date.UTC(year, month - 1, day)).getUTCDay()),
    );
    const weekdayInitials = dayNumbers.map(
      (day) => WEEKDAY_INITIALS_ES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    );

    return (
      <div className="space-y-4 p-6">
        {pageHeader("Ponchador")}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {hasTeam && canViewAll && <PonchadorRosterScopeToggle rosterScope={rosterScope} />}
            {rosterScope === "all" && (
              <PonchadorDepartmentFilter departments={departmentNames} selectedDepartment={selectedDepartment} />
            )}
          </div>
          <PeriodFilter year={year} month={month} currentYear={currentYear} currentMonth={currentMonth} />
        </div>
        <PonchadorOverviewTable rows={gridRows} dayNumbers={dayNumbers} weekdayInitials={weekdayInitials} />
      </div>
    );
  }

  if (scope !== "self" && !targetContactId) {
    return (
      <div className="space-y-4 p-6">
        {pageHeader("Ponchador")}
        <PonchadorPersonSelector
          people={scope === "team" ? team : allPeople}
          contactId={null}
          groupByDepartment={scope === "all"}
        />
        <p className="text-sm text-muted-foreground">Selecciona una persona para ver su registro.</p>
      </div>
    );
  }

  const { data: contactSummaryRows, error: contactSummaryError } = await supabase.rpc(
    "get_ponchador_contact_summary",
    { p_contact_id: targetContactId },
  );

  let effectiveContactId = targetContactId as string;
  let viewedContact = contactSummaryRows?.[0];

  if (contactSummaryError || !viewedContact) {
    // Invalid/tampered contactId, or the caller lost access since a link was
    // shared (e.g. no longer manages that person) - fall back to their own
    // contact rather than erroring.
    effectiveContactId = myContactId;
    const fallback = await supabase.rpc("get_ponchador_contact_summary", { p_contact_id: myContactId });
    viewedContact = fallback.data?.[0];
  }

  if (!viewedContact) {
    // Shouldn't be reachable - myContactId was already confirmed to exist
    // above - but keeps the page from crashing if it somehow is.
    redirect("/ponchador");
  }

  const isViewingSelf = effectiveContactId === myContactId;

  const [
    { schedulesById, defaultSchedule },
    { data: departments },
    { data: punchRows },
    { data: leaveRows },
  ] = await Promise.all([
    getScheduleTemplatesContext(),
    supabase.from("departments").select("id, default_schedule_id"),
    supabase.rpc("get_ponchador_punches", {
      p_contact_id: effectiveContactId,
      p_from: windowStartIso,
      p_to: windowEndIso,
    }),
    supabase.rpc("get_ponchador_approved_leave", {
      p_contact_id: effectiveContactId,
      p_period_start: periodStartIso,
      p_period_end: periodEndIso,
    }),
  ]);

  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));
  const targetSchedule = getEffectiveSchedule(
    viewedContact.schedule_id,
    viewedContact.department_id ? departmentDefaultById.get(viewedContact.department_id) : null,
    schedulesById,
    defaultSchedule,
  );

  const arrivalsAndExits = buildDailyAttendanceRows((punchRows ?? []).map((p: { punched_at: string }) => p.punched_at));

  const approvedLeave: ApprovedLeaveRange[] = (leaveRows ?? []).map((r: { date_from: string; date_to: string }) => ({
    dateFrom: r.date_from,
    dateTo: r.date_to,
  }));

  const periodRows = buildAttendancePeriodRows(
    periodStartIso,
    periodEndIso,
    targetSchedule,
    arrivalsAndExits,
    approvedLeave,
    EARLY_DEPARTURE_THRESHOLD_MINUTES,
  );
  const summary = summarizeAttendancePeriod(periodRows);
  const puntualidadTierLabel = classifyPuntualidadLabel(summary.puntualidadPercent);

  let motivationalPhrase: string | null = null;
  let averageArrivalDeltaLabel: string | null = null;
  if (isViewingSelf) {
    const periodArrivals: DailyArrival[] = periodRows
      .filter((r): r is typeof r & { arrivalMinutes: number } => r.arrivalMinutes !== null)
      .map((r) => ({ dateIso: r.dateIso, arrivalMinutes: r.arrivalMinutes }));
    const comparison = attachScheduleComparison(periodArrivals, targetSchedule);
    const avgMinutesEarly = averageMinutesEarly(comparison);
    if (avgMinutesEarly !== null) {
      const tier = classifyArrivalTier(avgMinutesEarly, targetSchedule.tolerance_minutes);
      motivationalPhrase = pickMotivationalPhrase(tier, viewedContact.first_name, today.getUTCDate());
      const roundedDelta = Math.round(Math.abs(avgMinutesEarly));
      averageArrivalDeltaLabel = `${roundedDelta} min ${avgMinutesEarly >= 0 ? "temprano" : "tarde"}`;
    }
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
  const scheduleFooterNote = `${isViewingSelf ? "Tu horario" : "Horario"}: ${formatScheduleLine(targetSchedule)}. Tolerancia: ${targetSchedule.tolerance_minutes} minutos.`;
  const pageTitle = isViewingSelf ? "Ponchador" : `Ponchador de ${viewedContact.first_name} ${viewedContact.last_name}`;

  return (
    <div className="space-y-4 p-6">
      {pageHeader(pageTitle)}
      {scope !== "self" && (
        <PonchadorPersonSelector
          people={scope === "team" ? team : allPeople}
          contactId={effectiveContactId}
          groupByDepartment={scope === "all"}
        />
      )}
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
