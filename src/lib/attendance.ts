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
