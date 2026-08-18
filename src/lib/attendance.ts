import { APP_TIMEZONE } from "./contacts";
import type { ScheduleTemplate } from "./schedules";

export interface DailyArrival {
  dateIso: string; // "YYYY-MM-DD", business-timezone calendar day
  arrivalMinutes: number; // minutes since midnight, business-timezone local time
}

// Converts a raw punch timestamp into its business-timezone calendar day and
// minutes-since-midnight. Pure and deterministic regardless of the server's
// own local timezone - same guarantee getBusinessToday() already provides
// for "today", applied here to an arbitrary timestamp.
export function toBusinessTimeParts(punchedAtIso: string): { dateIso: string; minutesSinceMidnight: number } {
  const date = new Date(punchedAtIso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const dateIso = `${map.year}-${map.month}-${map.day}`;
  const minutesSinceMidnight = Number(map.hour) * 60 + Number(map.minute);
  return { dateIso, minutesSinceMidnight };
}

// A punch at or after noon can't be a morning arrival - it's someone's exit
// punch, a lunch-return punch, or (in practice) a stray device-test punch on
// a day with no real check-in. Only punches before this cutoff are eligible
// to be a day's "arrival."
const ARRIVAL_CUTOFF_MINUTES = 12 * 60;

export interface DailyAttendanceRow {
  dateIso: string; // "YYYY-MM-DD", business-timezone calendar day
  arrivalMinutes: number | null; // earliest punch before noon that day, or null
  exitMinutes: number | null; // latest punch that day, or null - see rule below
}

// Groups raw punch timestamps by business-timezone calendar day. For each day
// that has at least one punch:
// - arrivalMinutes is the earliest punch before noon that day, or null if
//   every punch that day was at/after noon - a lone afternoon punch is not
//   evidence of when someone arrived that morning.
// - exitMinutes is the day's latest punch, UNLESS that day has exactly one
//   punch and it's already the arrival - a single morning punch isn't shown
//   as both an entrada and a salida, since there's no second event to
//   report. A day whose only punch is in the afternoon has no arrival, so
//   that one punch is reported as exitMinutes instead - there's no arrival
//   for it to collide with.
export function buildDailyAttendanceRows(punchedAtIsoTimestamps: string[]): DailyAttendanceRow[] {
  const minutesByDate = new Map<string, number[]>();
  for (const iso of punchedAtIsoTimestamps) {
    const { dateIso, minutesSinceMidnight } = toBusinessTimeParts(iso);
    const list = minutesByDate.get(dateIso) ?? [];
    list.push(minutesSinceMidnight);
    minutesByDate.set(dateIso, list);
  }

  const rows: DailyAttendanceRow[] = [];
  for (const [dateIso, minutes] of minutesByDate.entries()) {
    const sorted = [...minutes].sort((a, b) => a - b);
    const morningPunches = sorted.filter((m) => m < ARRIVAL_CUTOFF_MINUTES);
    const arrivalMinutes = morningPunches.length > 0 ? morningPunches[0] : null;
    const latest = sorted[sorted.length - 1];
    const exitMinutes = sorted.length > 1 || arrivalMinutes === null ? latest : null;
    rows.push({ dateIso, arrivalMinutes, exitMinutes });
  }
  return rows.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

// Thin filter over buildDailyAttendanceRows - kept as its own function since
// most callers (the monthly average, the schedule comparison) only care
// about arrivals and shouldn't need to know exitMinutes exists at all.
export function deriveDailyArrivals(punchedAtIsoTimestamps: string[]): DailyArrival[] {
  return buildDailyAttendanceRows(punchedAtIsoTimestamps)
    .filter((row): row is DailyAttendanceRow & { arrivalMinutes: number } => row.arrivalMinutes !== null)
    .map((row) => ({ dateIso: row.dateIso, arrivalMinutes: row.arrivalMinutes }));
}

// Averages the time-of-day component across a set of daily arrivals. Returns
// null if the list is empty (no punches yet this month) rather than NaN.
export function averageArrivalMinutes(arrivals: DailyArrival[]): number | null {
  if (arrivals.length === 0) return null;
  const total = arrivals.reduce((sum, a) => sum + a.arrivalMinutes, 0);
  return total / arrivals.length;
}

// Formats minutes-since-midnight as "8:12 am" - the same am/pm convention
// formatScheduleTime uses in src/lib/schedules.ts, but taking a raw (possibly
// fractional, e.g. an average) minute count instead of a "HH:MM:SS" string.
export function formatArrivalTime(minutesSinceMidnight: number): string {
  const rounded = Math.round(minutesSinceMidnight);
  const hour = Math.floor(rounded / 60) % 24;
  const minute = rounded % 60;
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

// Converts a schedule's "HH:MM:SS" start/end time into minutes since
// midnight. Exported because page.tsx also needs it to build Card 3's
// EarlyArrivalCandidate.scheduledStartMinutes from a ScheduleDay.
export function scheduleTimeToMinutes(time: string): number {
  const [hourStr, minuteStr] = time.split(":");
  return Number(hourStr) * 60 + Number(minuteStr);
}

function businessDayOfWeek(dateIso: string): number {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export interface DailyArrivalWithSchedule extends DailyArrival {
  minutesEarly: number | null; // null if this date wasn't a scheduled workday
}

// Looks up each arrival's day of week (derived from dateIso) against
// schedule.days. When there's a matching scheduled day, minutesEarly =
// that day's start-time-in-minutes minus the arrival's minutesSinceMidnight
// (positive = early, negative = late). When there's no match (not a
// scheduled workday for this schedule), minutesEarly is null and that day
// is excluded from any average - a day off shouldn't count as "very early."
export function attachScheduleComparison(
  arrivals: DailyArrival[],
  schedule: ScheduleTemplate,
): DailyArrivalWithSchedule[] {
  const dayByDayOfWeek = new Map(schedule.days.map((d) => [d.day_of_week, d]));
  return arrivals.map((arrival) => {
    const scheduledDay = dayByDayOfWeek.get(businessDayOfWeek(arrival.dateIso));
    if (!scheduledDay) {
      return { ...arrival, minutesEarly: null };
    }
    return { ...arrival, minutesEarly: scheduleTimeToMinutes(scheduledDay.start_time) - arrival.arrivalMinutes };
  });
}

// Averages only the non-null minutesEarly values. null if there are none
// (e.g. every arrival fell on a day the schedule doesn't cover).
export function averageMinutesEarly(arrivals: DailyArrivalWithSchedule[]): number | null {
  const withSchedule = arrivals.filter((a) => a.minutesEarly !== null) as (DailyArrivalWithSchedule & {
    minutesEarly: number;
  })[];
  if (withSchedule.length === 0) return null;
  const total = withSchedule.reduce((sum, a) => sum + a.minutesEarly, 0);
  return total / withSchedule.length;
}

export type ArrivalTier = "muy_tarde" | "un_poco_tarde" | "a_tiempo" | "temprano" | "muy_temprano";

// avgMinutesEarly: positive = early on average, negative = late on average.
// toleranceMinutes: the viewer's effective schedule's tolerance_minutes.
// Boundaries match the spec's tier table exactly:
//   < -15                    -> muy_tarde
//   < -toleranceMinutes      -> un_poco_tarde
//   <= toleranceMinutes      -> a_tiempo
//   < 10                     -> temprano
//   otherwise                -> muy_temprano
export function classifyArrivalTier(avgMinutesEarly: number, toleranceMinutes: number): ArrivalTier {
  if (avgMinutesEarly < -15) return "muy_tarde";
  if (avgMinutesEarly < -toleranceMinutes) return "un_poco_tarde";
  if (avgMinutesEarly <= toleranceMinutes) return "a_tiempo";
  if (avgMinutesEarly < 10) return "temprano";
  return "muy_temprano";
}

// Verbatim phrase pool from the spec's "Motivational Message (Card 1)"
// section - warm and encouraging in every tier, never blaming.
const PHRASES_BY_TIER: Record<ArrivalTier, string[]> = {
  muy_tarde: [
    "{name}, sabemos que este mes no ha sido fácil para llegar a tiempo. ¡Un pequeño cambio en la rutina puede hacer la diferencia! 💪",
    "Ánimo, {name}. Todos tenemos meses difíciles — lo importante es seguir intentándolo.",
    "{name}, mañana es una nueva oportunidad para mejorar tu llegada. ¡Tú puedes!",
  ],
  un_poco_tarde: [
    "Vas por buen camino, {name}. Solo un poco más de esfuerzo y llegarás a tiempo.",
    "{name}, estás cerca de lograrlo. ¡Sigue así!",
  ],
  a_tiempo: [
    "¡Bien hecho, {name}! Mantener la puntualidad no es fácil y lo estás logrando.",
    "{name}, tu constancia llegando a tiempo no pasa desapercibida. ¡Gracias!",
  ],
  temprano: [
    "¡Excelente, {name}! Llegar temprano habla muy bien de tu compromiso.",
    "{name}, tu puntualidad es un ejemplo para el equipo. ¡Sigue así!",
  ],
  muy_temprano: [
    "¡Impresionante, {name}! Eres de los primeros en llegar cada día.",
    "{name}, tu disciplina para llegar temprano es admirable. ¡Felicidades!",
    "¡{name}, eres una máquina de puntualidad! Gracias por dar el ejemplo.",
  ],
};

// Picks one phrase from the matching tier's pool, substituting {name}.
// dayOfMonth selects deterministically among that tier's pool via modulo -
// stable within a day, varying day to day for repeat visitors.
export function pickMotivationalPhrase(tier: ArrivalTier, name: string, dayOfMonth: number): string {
  const pool = PHRASES_BY_TIER[tier];
  const phrase = pool[dayOfMonth % pool.length];
  return phrase.replace(/\{name\}/g, name);
}

export interface EarlyArrivalCandidate {
  contactId: string;
  name: string;
  photoUrl: string | null;
  arrivalMinutes: number;
  scheduledStartMinutes: number;
}

export interface EarlyArrivalRanking extends EarlyArrivalCandidate {
  minutesEarly: number;
}

// Computes minutesEarly = scheduledStartMinutes - arrivalMinutes for each
// candidate, drops anyone who arrived late (minutesEarly < 0), sorts
// descending by minutesEarly (stable - Array.prototype.sort preserves the
// relative order of equal elements), and returns the top `limit`.
export function rankEarlyArrivals(candidates: EarlyArrivalCandidate[], limit: number): EarlyArrivalRanking[] {
  return candidates
    .map((c) => ({ ...c, minutesEarly: c.scheduledStartMinutes - c.arrivalMinutes }))
    .filter((c) => c.minutesEarly >= 0)
    .sort((a, b) => b.minutesEarly - a.minutesEarly)
    .slice(0, limit);
}

export type DayEstado = "puntual" | "llegada_tarde" | "salida_anticipada" | "ausente" | "permiso";

export interface AttendancePeriodRow {
  dateIso: string;
  arrivalMinutes: number | null;
  exitMinutes: number | null;
  workedMinutes: number | null; // exitMinutes - arrivalMinutes when both present, else null
  estado: DayEstado;
  observacion: string; // "—" when there's nothing to note
}

export interface ApprovedLeaveRange {
  dateFrom: string; // "YYYY-MM-DD"
  dateTo: string;
}

function enumerateDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  let cursor = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  while (cursor <= end) {
    const d = new Date(cursor);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    dates.push(iso);
    cursor += 24 * 60 * 60 * 1000;
  }
  return dates;
}

function isDateInRange(dateIso: string, startIso: string, endIso: string): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

// Builds one row per scheduled workday between periodStartIso and
// periodEndIso (inclusive). The caller is responsible for clamping
// periodEndIso to getBusinessToday() so future days aren't evaluated for
// absence. Non-workdays for this schedule are not included in the result at
// all. For each scheduled day, in priority order:
//   1. Covered by an approved leave range -> "permiso"
//   2. No punch that day at all -> "ausente", observación "Sin justificación"
//   3. Arrival later than schedule start + tolerance_minutes -> "llegada_tarde"
//   4. Exit earlier than schedule end - earlyDepartureThresholdMinutes ->
//      "salida_anticipada" (only checked if the day wasn't already
//      "llegada_tarde" - arrival problems take priority over departure ones)
//   5. Otherwise -> "puntual"
export function buildAttendancePeriodRows(
  periodStartIso: string,
  periodEndIso: string,
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  approvedLeave: ApprovedLeaveRange[],
  earlyDepartureThresholdMinutes: number,
): AttendancePeriodRow[] {
  const scheduledDayOfWeeks = new Map(schedule.days.map((d) => [d.day_of_week, d]));
  const rowsByDate = new Map(arrivalsAndExits.map((r) => [r.dateIso, r]));

  const rows: AttendancePeriodRow[] = [];
  for (const dateIso of enumerateDateRange(periodStartIso, periodEndIso)) {
    const scheduledDay = scheduledDayOfWeeks.get(businessDayOfWeek(dateIso));
    if (!scheduledDay) continue;

    const onLeave = approvedLeave.some((leave) => isDateInRange(dateIso, leave.dateFrom, leave.dateTo));
    const attendance = rowsByDate.get(dateIso);
    const arrivalMinutes = attendance?.arrivalMinutes ?? null;
    const exitMinutes = attendance?.exitMinutes ?? null;
    const workedMinutes = arrivalMinutes !== null && exitMinutes !== null ? exitMinutes - arrivalMinutes : null;

    if (onLeave) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "permiso", observacion: "Permiso aprobado" });
      continue;
    }

    if (arrivalMinutes === null) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "ausente", observacion: "Sin justificación" });
      continue;
    }

    const scheduledStart = scheduleTimeToMinutes(scheduledDay.start_time);
    const scheduledEnd = scheduleTimeToMinutes(scheduledDay.end_time);
    const lateByTotal = arrivalMinutes - scheduledStart;
    if (lateByTotal > schedule.tolerance_minutes) {
      rows.push({
        dateIso,
        arrivalMinutes,
        exitMinutes,
        workedMinutes,
        estado: "llegada_tarde",
        observacion: `${lateByTotal} min tarde`,
      });
      continue;
    }

    if (exitMinutes !== null) {
      const earlyByTotal = scheduledEnd - exitMinutes;
      if (earlyByTotal > earlyDepartureThresholdMinutes) {
        rows.push({
          dateIso,
          arrivalMinutes,
          exitMinutes,
          workedMinutes,
          estado: "salida_anticipada",
          observacion: `${earlyByTotal} min antes`,
        });
        continue;
      }
    }

    rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "puntual", observacion: "—" });
  }
  return rows;
}

export interface AttendancePeriodSummary {
  diasHabiles: number;
  diasTrabajados: number; // puntual + llegada_tarde + salida_anticipada
  puntuales: number;
  llegadasTarde: number;
  salidasAnticipadas: number;
  ausencias: number;
  permisos: number;
  feriados: number; // always 0 - no holiday calendar exists yet
  horasTrabajadasMinutes: number;
  promedioEntradaMinutes: number | null;
  puntualidadPercent: number | null;
}

// Pure aggregation over buildAttendancePeriodRows' own output - no new data
// source, just counting/summing what's already there.
export function summarizeAttendancePeriod(rows: AttendancePeriodRow[]): AttendancePeriodSummary {
  const puntuales = rows.filter((r) => r.estado === "puntual").length;
  const llegadasTarde = rows.filter((r) => r.estado === "llegada_tarde").length;
  const salidasAnticipadas = rows.filter((r) => r.estado === "salida_anticipada").length;
  const ausencias = rows.filter((r) => r.estado === "ausente").length;
  const permisos = rows.filter((r) => r.estado === "permiso").length;
  const diasTrabajados = puntuales + llegadasTarde + salidasAnticipadas;
  const horasTrabajadasMinutes = rows.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0);

  const arrivalsWorked = rows
    .filter((r) => r.estado === "puntual" || r.estado === "llegada_tarde" || r.estado === "salida_anticipada")
    .map((r) => r.arrivalMinutes)
    .filter((m): m is number => m !== null);
  const promedioEntradaMinutes =
    arrivalsWorked.length === 0 ? null : arrivalsWorked.reduce((a, b) => a + b, 0) / arrivalsWorked.length;

  const puntualidadPercent = diasTrabajados === 0 ? null : Math.round((puntuales / diasTrabajados) * 100);

  return {
    diasHabiles: rows.length,
    diasTrabajados,
    puntuales,
    llegadasTarde,
    salidasAnticipadas,
    ausencias,
    permisos,
    feriados: 0,
    horasTrabajadasMinutes,
    promedioEntradaMinutes,
    puntualidadPercent,
  };
}

// Qualitative label shown next to the Puntualidad % stat card. null input
// (no días trabajados yet this period) renders no badge at all.
export function classifyPuntualidadLabel(puntualidadPercent: number | null): "Excelente" | "Buena" | "A mejorar" | null {
  if (puntualidadPercent === null) return null;
  if (puntualidadPercent >= 95) return "Excelente";
  if (puntualidadPercent >= 85) return "Buena";
  return "A mejorar";
}

export type GridDayStatus = "vacaciones" | "permiso" | "ausente" | "weekend" | "normal";

export interface AttendanceGridDay {
  dateIso: string;
  dayNumber: number;
  arrivalLabel: string | null;
  exitLabel: string | null;
  status: GridDayStatus;
}

// Builds one cell-pair per CALENDAR day in the period (including weekends -
// unlike buildAttendancePeriodRows, which only enumerates scheduled
// workdays), for the Vista general grid. Distinguishes vacaciones from
// permiso - buildAttendancePeriodRows deliberately keeps merging both into a
// single "permiso" Estado for the single-person dashboard, so this is a
// separate, additive function rather than a change to that one.
export function buildAttendanceGridDays(
  periodStartIso: string,
  periodEndIso: string,
  todayIso: string,
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  vacacionesRanges: ApprovedLeaveRange[],
  permisoRanges: ApprovedLeaveRange[],
): AttendanceGridDay[] {
  const scheduledDayOfWeeks = new Map(schedule.days.map((d) => [d.day_of_week, d]));
  const rowsByDate = new Map(arrivalsAndExits.map((r) => [r.dateIso, r]));

  const days: AttendanceGridDay[] = [];
  for (const dateIso of enumerateDateRange(periodStartIso, periodEndIso)) {
    const dayNumber = Number(dateIso.slice(8, 10));
    const attendance = rowsByDate.get(dateIso);
    const arrivalMinutes = attendance?.arrivalMinutes ?? null;
    const exitMinutes = attendance?.exitMinutes ?? null;
    const arrivalLabel = arrivalMinutes === null ? null : formatArrivalTime(arrivalMinutes);
    const exitLabel = exitMinutes === null ? null : formatArrivalTime(exitMinutes);

    const onVacaciones = vacacionesRanges.some((r) => isDateInRange(dateIso, r.dateFrom, r.dateTo));
    const onPermiso = permisoRanges.some((r) => isDateInRange(dateIso, r.dateFrom, r.dateTo));
    const isScheduledWorkday = scheduledDayOfWeeks.has(businessDayOfWeek(dateIso));

    let status: GridDayStatus;
    if (onVacaciones) {
      status = "vacaciones";
    } else if (onPermiso) {
      status = "permiso";
    } else if (isScheduledWorkday && arrivalMinutes === null && dateIso <= todayIso) {
      status = "ausente";
    } else if (!isScheduledWorkday) {
      status = "weekend";
    } else {
      status = "normal";
    }

    days.push({ dateIso, dayNumber, arrivalLabel, exitLabel, status });
  }
  return days;
}
