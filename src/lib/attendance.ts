import { APP_TIMEZONE } from "./contacts";

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
