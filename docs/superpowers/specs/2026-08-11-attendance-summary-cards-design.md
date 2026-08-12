# Attendance Summary Cards (Home Page) — Design

## Context

This is a scoped-down, combined take on the two remaining sub-projects from the original attendance-analytics decomposition (see `docs/superpowers/specs/2026-08-11-horarios-named-schedules-design.md`'s "Out of Scope" section): Bitácora (personal arrival history/average) and cross-employee comparison. Rather than build them as two separate features, the user asked for a single home-page widget — three cards, shown together — so this spec covers exactly that: a viewer's own monthly average arrival time, their arrival today, and a same-day leaderboard of who arrived earliest relative to their own schedule. It does not attempt full Bitácora (a historical log view, exit times, month-by-month browsing) or a permission-gated comparison view — those remain open if ever requested again.

This builds directly on two things merged earlier the same day: the Hikvision punch-ingestion pipeline (`time_clock_punches`, `contacts.hikvision_employee_no`) and the named-schedule system (`schedule_templates`/`schedule_template_days`, resolved via `getEffectiveSchedule` in `src/lib/schedules.ts`).

## Summary

A new 3-card block on the home page (`src/app/(app)/page.tsx`), in its own row separate from the existing birthdays/news widget grid:

1. **Mi promedio** — the viewer's average arrival time so far this calendar month, plus a personalized motivational or congratulatory phrase based on how early/late that average runs relative to their own schedule.
2. **Mi llegada de hoy** — the viewer's arrival time today.
3. **Top 5 de hoy** — the five people (company-wide) who arrived earliest today relative to their own effective schedule.

The whole block is hidden entirely for any contact with no `hikvision_employee_no` assigned — no punch data means nothing meaningful to show, and no extra queries run for them.

## Motivational Message (Card 1)

Alongside the plain average-arrival-time value, Card 1 shows one line of personalized, name-addressed text ("{name}, ...") reflecting how the viewer is doing this month, in one of five tiers based on **average minutes early/late relative to their own effective schedule** (not the raw clock-time average — someone whose schedule starts at 7am and averages 6:50am is "10 minutes early" the same way someone on a 9am schedule averaging 8:50am is, even though their clock-time averages differ):

| Tier | Condition (avg. minutes early; `T` = the viewer's schedule's `tolerance_minutes`) |
|---|---|
| Muy tarde | average is more than 15 minutes late |
| Un poco tarde | late, beyond tolerance, but not more than 15 minutes |
| A tiempo | within tolerance (`-T` to `+T` minutes) |
| Temprano | more than `T` minutes early, but less than 10 |
| Muy temprano | 10 or more minutes early |

Each tier has its own pool of at least 2 phrases (12 total across all five tiers), every phrase containing a `{name}` placeholder filled with the viewer's first name. Which specific phrase from the matching tier's pool is shown is picked deterministically from the day of the month (`dayOfMonth % pool.length`) — stable within a day (no jarring change on every page refresh) but varying day to day for repeat visitors.

**Phrase pool** (Spanish, warm and encouraging in tone — the "tarde" tiers never blame or shame, they encourage; the "temprano" tiers genuinely congratulate):

- **Muy tarde:** "{name}, sabemos que este mes no ha sido fácil para llegar a tiempo. ¡Un pequeño cambio en la rutina puede hacer la diferencia! 💪" · "Ánimo, {name}. Todos tenemos meses difíciles — lo importante es seguir intentándolo." · "{name}, mañana es una nueva oportunidad para mejorar tu llegada. ¡Tú puedes!"
- **Un poco tarde:** "Vas por buen camino, {name}. Solo un poco más de esfuerzo y llegarás a tiempo." · "{name}, estás cerca de lograrlo. ¡Sigue así!"
- **A tiempo:** "¡Bien hecho, {name}! Mantener la puntualidad no es fácil y lo estás logrando." · "{name}, tu constancia llegando a tiempo no pasa desapercibida. ¡Gracias!"
- **Temprano:** "¡Excelente, {name}! Llegar temprano habla muy bien de tu compromiso." · "{name}, tu puntualidad es un ejemplo para el equipo. ¡Sigue así!"
- **Muy temprano:** "¡Impresionante, {name}! Eres de los primeros en llegar cada día." · "{name}, tu disciplina para llegar temprano es admirable. ¡Felicidades!" · "¡{name}, eres una máquina de puntualidad! Gracias por dar el ejemplo."

## Computation Model

No new table. Punch volume is small enough (one company, a handful of devices) to compute everything at page-render time from `time_clock_punches` + the existing schedule-resolution code.

**"Arrival" for a given calendar day** = the earliest `punched_at` among that contact's punches on that day, where "day" is a calendar day in the business timezone (`America/Santo_Domingo`) — the same timezone `getBusinessToday()` already uses elsewhere in this codebase, for the same reason (a server running in UTC must not let "today" or "this month" drift by hours near midnight local time).

**Timezone handling, concretely:** rather than computing precise UTC query boundaries for "today" or "the 1st of this month" (the hard direction to get right without a timezone library, which this codebase doesn't have), queries fetch a deliberately wide time range (e.g. "the last 40 days" for the monthly average, "the last 2 days" for today's data) and the exact bucketing into business-timezone calendar days happens in application code, using the same `Intl.DateTimeFormat`-based technique `getBusinessToday()` already uses. This sidesteps timezone-offset math entirely — filtering "is this business-timezone calendar day string equal to today's" is simple string equality once each punch's timestamp has been converted.

`APP_TIMEZONE` (currently a private constant in `src/lib/contacts.ts`) is exported from that file so `src/lib/attendance.ts` can reuse it instead of redefining it.

**`time_clock_punches` access:** this table has row-level security enabled with zero SELECT policies — only the service-role agent client (used by `/api/attendance/punches`) can read it today; the regular session-bound client `page.tsx` otherwise uses cannot. Rather than add a new "any authenticated user can read" policy (which would let any employee query any other employee's full raw punch history directly via the Supabase API, not just what these cards display), `page.tsx`'s new data-fetching for Cards 1–3 uses `createAdminClient()` (`src/lib/supabase/admin.ts`) solely for the `time_clock_punches` queries. This keeps exposure limited to exactly what the server code chooses to compute and render (the viewer's own average/today arrival, and the top-5 ranking) — no new RLS policy, no new direct-query surface.

**`contacts` access for Card 3's candidate list:** the same problem shows up a second time. `contacts_select`'s RLS policy (`supabase/migrations/20260730120000_contacts_self_edit.sql`) only allows reading a contact row if the viewer has `can_view` on the `contacts` module or it's their own row — not every employee has that permission (this is exactly why the birthdays widget's own contact list fetch is already gated behind `flagsRows?.[0]?.can_view` in `page.tsx`). Since this spec explicitly chose "company-wide Top 5, no permission gate," the candidate-contact query (`id, first_name, last_name, photo_url, schedule_id, department_id` for every `status = 'active'` contact with `hikvision_employee_no is not null`) also uses `createAdminClient()`, for the same reason and with the same narrow scope as the punches query above — it does not affect the `contacts_select` policy or any other read of `contacts` on this page.

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

export interface DailyArrivalWithSchedule extends DailyArrival {
  minutesEarly: number | null; // null if this date wasn't a scheduled workday
}

// Looks up each arrival's day_of_week (derived from dateIso) against
// schedule.days. When there's a matching scheduled day, minutesEarly =
// that day's start-time-in-minutes minus the arrival's minutesSinceMidnight
// (positive = early, negative = late). When there's no match (not a
// scheduled workday for this schedule), minutesEarly is null and that day
// is excluded from any average - a day off shouldn't count as "very early."
export function attachScheduleComparison(
  arrivals: DailyArrival[],
  schedule: ScheduleTemplate,
): DailyArrivalWithSchedule[];

// Averages only the non-null minutesEarly values. null if there are none
// (e.g. every arrival fell on a day the schedule doesn't cover).
export function averageMinutesEarly(arrivals: DailyArrivalWithSchedule[]): number | null;

export type ArrivalTier = "muy_tarde" | "un_poco_tarde" | "a_tiempo" | "temprano" | "muy_temprano";

// avgMinutesEarly: positive = early on average, negative = late on average.
// toleranceMinutes: the viewer's effective schedule's tolerance_minutes.
export function classifyArrivalTier(avgMinutesEarly: number, toleranceMinutes: number): ArrivalTier;

// Picks one phrase from the matching tier's pool (see the Motivational
// Message section above for the actual phrase text), substituting {name}.
// dayOfMonth selects deterministically among that tier's pool via modulo.
export function pickMotivationalPhrase(tier: ArrivalTier, name: string, dayOfMonth: number): string;

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

- **Card 1 (monthly average):** fetch the viewer's own `time_clock_punches` from roughly the last 40 days (wide enough to always cover "the 1st of this month" regardless of today's date), run `deriveDailyArrivals`, filter to `dateIso >= "<year>-<month>-01"`, run `averageArrivalMinutes` for the displayed clock-time value. `null` → render "Sin datos este mes" and skip the motivational phrase entirely (nothing to base it on). Otherwise, also run `attachScheduleComparison` (using the viewer's own effective schedule, already resolved via `getEffectiveSchedule` elsewhere on this page for `schedule_line`) → `averageMinutesEarly` → `classifyArrivalTier` (passing that same schedule's `tolerance_minutes`) → `pickMotivationalPhrase` (passing the viewer's first name and `today.getUTCDate()` as the day-of-month selector, consistent with how `getBusinessToday()` already encodes "today").
- **Card 2 (today):** reuse the same fetch, filter to `dateIso === todayIso`, take that day's arrival if present. None → render "Aún no has ponchado hoy."
- **Card 3 (top 5 today):** fetch every `status = 'active'` contact with `hikvision_employee_no is not null` (`id, first_name, last_name, photo_url, schedule_id, department_id`), plus `time_clock_punches` from the last 2 days for all their `hikvision_employee_no` values, plus `getScheduleTemplatesContext()` + `departments.default_schedule_id` (both already used elsewhere on this page for the profile card's `schedule_line`). For each contact: resolve their effective schedule via `getEffectiveSchedule`, look up today's `day_of_week` within that schedule's `days` array — no match means they're not scheduled to work today, skip them; find their earliest punch today via `toBusinessTimeParts` — no punch today, skip them; otherwise build an `EarlyArrivalCandidate` and feed the full list into `rankEarlyArrivals(candidates, 5)`.

## UI

A new component, `AttendanceSummaryCards.tsx`, rendered as its own row on the home page, above or below `BirthdaysWidget` (visually separate — this is an unrelated concern from birthdays/news). Styled consistently with the existing `MyProfileCard`/birthday-card visual language (rounded border, small icon, muted label + bold value).

**Responsive layout**, following the same breakpoint conventions already used by `BirthdaysWidget`'s grid and `ContactsCards`' card grid elsewhere in this codebase (`grid-cols-1` base, widening at `sm:`/`md:` breakpoints — no new breakpoint scheme introduced):

- Base (mobile, `grid-cols-1`): the three cards stack in a single column, full width, in the fixed order Mi promedio → Mi llegada de hoy → Top 5.
- `sm:` and up (`sm:grid-cols-2`): Mi promedio and Mi llegada de hoy sit side by side as two half-width cards; Top 5 spans both columns (`sm:col-span-2`) below them, since it naturally holds more content (5 rows) than the other two single-stat cards.
- `lg:` and up (`lg:grid-cols-4`): Mi promedio and Mi llegada de hoy each take one column; Top 5 takes two columns (`lg:col-span-2`), so all three sit in a single row with Top 5 given proportionally more width. This mirrors `BirthdaysWidget`'s existing 4-column grid, which already gives its widest card (upcoming birthdays) double the width of its neighbors the same way.

Each of the "Mi promedio"/"Mi llegada de hoy" cards is a single stat (icon + label + value), sized to stay legible without wrapping awkwardly at any width. "Mi promedio" additionally shows the personalized phrase as a second, smaller line below the clock-time value (wrapping normally — these phrases run longer than the other cards' sub-lines, so they're not truncated to one line). The "Top 5" card's 5 rows (small avatar + name + "Llegó a las 6:50 am (10 min antes)") use `truncate` on the name the same way `MyProfileCard`/`ContactsCards` already do, so long names don't break the layout on narrow screens.

## Testing

Unit tests for every function in `src/lib/attendance.ts`: `toBusinessTimeParts` (a few fixed timestamps, including one that crosses midnight UTC but not business-midnight, and vice versa — the exact class of bug `getBusinessToday()` was already patched for once), `deriveDailyArrivals` (multiple punches same day keeps the earliest, punches across several days), `averageArrivalMinutes` (empty list → null, single day, multiple days), `formatArrivalTime` (midnight, noon, standard times — mirroring `formatScheduleTime`'s existing test cases), `rankEarlyArrivals` (ties, negative/late exclusion, limiting to N, empty input), `attachScheduleComparison` (a day matching a scheduled day-of-week gets a `minutesEarly` value, a day with no matching scheduled day gets `null`), `averageMinutesEarly` (ignores nulls, empty/all-null → null), `classifyArrivalTier` (a case per tier, plus boundary values exactly at each cutoff and exactly at `±tolerance_minutes` for a non-zero tolerance), `pickMotivationalPhrase` (same tier + day-of-month always returns the same phrase; different days can return different phrases from the same tier's pool; `{name}` is substituted correctly).

No new integration test is needed — `time_clock_punches`' RLS is already covered by `src/test/integration/attendancePunchesApi.test.ts` from the original Hikvision-agent work.

## Out of Scope

- A historical/browsable Bitácora view (past months, exit times, per-day drill-down) — this spec only covers the three specific cards requested.
- Permission-gating the "Top 5" card — the user explicitly chose company-wide, no restriction, for everyone who has a ponchador code.
- Any change to how punches are ingested, or to the schedule system itself.
