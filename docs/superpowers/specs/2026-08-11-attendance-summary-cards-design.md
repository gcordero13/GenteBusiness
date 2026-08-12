# Attendance Summary Cards (Home Page) — Design

## Context

This is a scoped-down, combined take on the two remaining sub-projects from the original attendance-analytics decomposition (see `docs/superpowers/specs/2026-08-11-horarios-named-schedules-design.md`'s "Out of Scope" section): Bitácora (personal arrival history/average) and cross-employee comparison. Rather than build them as two separate features, the user asked for a single home-page widget — three cards, shown together — so this spec covers exactly that: a viewer's own monthly average arrival time, their arrival today, and a same-day leaderboard of who arrived earliest relative to their own schedule. It does not attempt full Bitácora (a historical log view, exit times, month-by-month browsing) or a permission-gated comparison view — those remain open if ever requested again.

This builds directly on two things merged earlier the same day: the Hikvision punch-ingestion pipeline (`time_clock_punches`, `contacts.hikvision_employee_no`) and the named-schedule system (`schedule_templates`/`schedule_template_days`, resolved via `getEffectiveSchedule` in `src/lib/schedules.ts`).

## Summary

A new 3-card block on the home page (`src/app/(app)/page.tsx`), in its own row separate from the existing birthdays/news widget grid:

1. **Mi promedio** — the viewer's average arrival time so far this calendar month.
2. **Mi llegada de hoy** — the viewer's arrival time today.
3. **Top 5 de hoy** — the five people (company-wide) who arrived earliest today relative to their own effective schedule.

The whole block is hidden entirely for any contact with no `hikvision_employee_no` assigned — no punch data means nothing meaningful to show, and no extra queries run for them.

## Computation Model

No new table. Punch volume is small enough (one company, a handful of devices) to compute everything at page-render time from `time_clock_punches` + the existing schedule-resolution code.

**"Arrival" for a given calendar day** = the earliest `punched_at` among that contact's punches on that day, where "day" is a calendar day in the business timezone (`America/Santo_Domingo`) — the same timezone `getBusinessToday()` already uses elsewhere in this codebase, for the same reason (a server running in UTC must not let "today" or "this month" drift by hours near midnight local time).

**Timezone handling, concretely:** rather than computing precise UTC query boundaries for "today" or "the 1st of this month" (the hard direction to get right without a timezone library, which this codebase doesn't have), queries fetch a deliberately wide time range (e.g. "the last 40 days" for the monthly average, "the last 2 days" for today's data) and the exact bucketing into business-timezone calendar days happens in application code, using the same `Intl.DateTimeFormat`-based technique `getBusinessToday()` already uses. This sidesteps timezone-offset math entirely — filtering "is this business-timezone calendar day string equal to today's" is simple string equality once each punch's timestamp has been converted.

`APP_TIMEZONE` (currently a private constant in `src/lib/contacts.ts`) is exported from that file so `src/lib/attendance.ts` can reuse it instead of redefining it.

## `src/lib/attendance.ts` — pure functions

```typescript
export interface DailyArrival {
  dateIso: string; // "YYYY-MM-DD", business-timezone calendar day
  arrivalMinutes: number; // minutes since midnight, business-timezone local time
}

// Converts a raw punch timestamp into its business-timezone calendar day and
// minutes-since-midnight. Pure and deterministic regardless of the server's
// own local timezone, same guarantee getBusinessToday() already provides.
export function toBusinessTimeParts(punchedAtIso: string): { dateIso: string; minutesSinceMidnight: number };

// Groups raw punch timestamps by business-timezone calendar day and keeps
// only the earliest punch per day - the day's "arrival."
export function deriveDailyArrivals(punchedAtIsoTimestamps: string[]): DailyArrival[];

// Averages the time-of-day component across a set of daily arrivals. Returns
// null if the list is empty (no punches yet this month) rather than NaN.
export function averageArrivalMinutes(arrivals: DailyArrival[]): number | null;

// Formats minutes-since-midnight as "8:12 am" - the same am/pm convention
// formatScheduleTime already uses in src/lib/schedules.ts, but taking a raw
// minute count instead of a "HH:MM:SS" string.
export function formatArrivalTime(minutesSinceMidnight: number): string;

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
// descending by minutesEarly, and returns the top `limit`.
export function rankEarlyArrivals(candidates: EarlyArrivalCandidate[], limit: number): EarlyArrivalRanking[];
```

## Data Fetching — `src/app/(app)/page.tsx`

Runs only if the viewer's own `contacts` row has `hikvision_employee_no` set (checked as part of the existing `myContact` fetch, which already runs for the profile card).

- **Card 1 (monthly average):** fetch the viewer's own `time_clock_punches` from roughly the last 40 days (wide enough to always cover "the 1st of this month" regardless of today's date), run `deriveDailyArrivals`, filter to `dateIso >= "<year>-<month>-01"`, run `averageArrivalMinutes`. `null` → render "Sin datos este mes."
- **Card 2 (today):** reuse the same fetch, filter to `dateIso === todayIso`, take that day's arrival if present. None → render "Aún no has ponchado hoy."
- **Card 3 (top 5 today):** fetch every `status = 'active'` contact with `hikvision_employee_no is not null` (`id, first_name, last_name, photo_url, schedule_id, department_id`), plus `time_clock_punches` from the last 2 days for all their `hikvision_employee_no` values, plus `getScheduleTemplatesContext()` + `departments.default_schedule_id` (both already used elsewhere on this page for the profile card's `schedule_line`). For each contact: resolve their effective schedule via `getEffectiveSchedule`, look up today's `day_of_week` within that schedule's `days` array — no match means they're not scheduled to work today, skip them; find their earliest punch today via `toBusinessTimeParts` — no punch today, skip them; otherwise build an `EarlyArrivalCandidate` and feed the full list into `rankEarlyArrivals(candidates, 5)`.

## UI

A new component, `AttendanceSummaryCards.tsx`, rendered as its own row on the home page, above or below `BirthdaysWidget` (visually separate — this is an unrelated concern from birthdays/news). Styled consistently with the existing `MyProfileCard`/birthday-card visual language (rounded border, small icon, muted label + bold value).

**Responsive layout**, following the same breakpoint conventions already used by `BirthdaysWidget`'s grid and `ContactsCards`' card grid elsewhere in this codebase (`grid-cols-1` base, widening at `sm:`/`md:` breakpoints — no new breakpoint scheme introduced):

- Base (mobile, `grid-cols-1`): the three cards stack in a single column, full width, in the fixed order Mi promedio → Mi llegada de hoy → Top 5.
- `sm:` and up (`sm:grid-cols-2`): Mi promedio and Mi llegada de hoy sit side by side as two half-width cards; Top 5 spans both columns (`sm:col-span-2`) below them, since it naturally holds more content (5 rows) than the other two single-stat cards.
- `lg:` and up (`lg:grid-cols-4`): Mi promedio and Mi llegada de hoy each take one column; Top 5 takes two columns (`lg:col-span-2`), so all three sit in a single row with Top 5 given proportionally more width. This mirrors `BirthdaysWidget`'s existing 4-column grid, which already gives its widest card (upcoming birthdays) double the width of its neighbors the same way.

Each of the "Mi promedio"/"Mi llegada de hoy" cards is a single stat (icon + label + value), sized to stay legible without wrapping awkwardly at any width. The "Top 5" card's 5 rows (small avatar + name + "Llegó a las 6:50 am (10 min antes)") use `truncate` on the name the same way `MyProfileCard`/`ContactsCards` already do, so long names don't break the layout on narrow screens.

## Testing

Unit tests for every function in `src/lib/attendance.ts`: `toBusinessTimeParts` (a few fixed timestamps, including one that crosses midnight UTC but not business-midnight, and vice versa — the exact class of bug `getBusinessToday()` was already patched for once), `deriveDailyArrivals` (multiple punches same day keeps the earliest, punches across several days), `averageArrivalMinutes` (empty list → null, single day, multiple days), `formatArrivalTime` (midnight, noon, standard times — mirroring `formatScheduleTime`'s existing test cases), `rankEarlyArrivals` (ties, negative/late exclusion, limiting to N, empty input).

No new integration test is needed — `time_clock_punches`' RLS is already covered by `src/test/integration/attendancePunchesApi.test.ts` from the original Hikvision-agent work.

## Out of Scope

- A historical/browsable Bitácora view (past months, exit times, per-day drill-down) — this spec only covers the three specific cards requested.
- Permission-gating the "Top 5" card — the user explicitly chose company-wide, no restriction, for everyone who has a ponchador code.
- Any change to how punches are ingested, or to the schedule system itself.
