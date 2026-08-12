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

// Groups raw punch timestamps by business-timezone calendar day and keeps
// only the earliest punch per day - that day's "arrival."
export function deriveDailyArrivals(punchedAtIsoTimestamps: string[]): DailyArrival[] {
  const earliestByDate = new Map<string, number>();
  for (const iso of punchedAtIsoTimestamps) {
    const { dateIso, minutesSinceMidnight } = toBusinessTimeParts(iso);
    const existing = earliestByDate.get(dateIso);
    if (existing === undefined || minutesSinceMidnight < existing) {
      earliestByDate.set(dateIso, minutesSinceMidnight);
    }
  }
  return Array.from(earliestByDate.entries())
    .map(([dateIso, arrivalMinutes]) => ({ dateIso, arrivalMinutes }))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
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
