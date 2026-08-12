# Attendance Summary Cards (Home Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-card attendance summary block to the home page — the viewer's monthly average arrival time (with a personalized motivational/congratulatory phrase), their arrival today, and a company-wide top-5 "arrived earliest relative to their own schedule" leaderboard — visible only to contacts with a `hikvision_employee_no`.

**Architecture:** A new pure-function module (`src/lib/attendance.ts`) derives daily arrivals from raw `time_clock_punches` rows and compares them against each contact's effective schedule (`src/lib/schedules.ts`, already built). `src/app/(app)/page.tsx` fetches the punch/contact data needed for all three cards (using the existing service-role admin client for the two queries RLS doesn't allow the session client to run) and passes fully-computed, presentation-ready data into a new `AttendanceSummaryCards.tsx` component. No new database table or migration.

**Tech Stack:** Next.js Server Components, Supabase (`@/lib/supabase/server` for session-scoped reads, `@/lib/supabase/admin` for the two RLS-restricted reads), TypeScript, Vitest, Tailwind CSS, lucide-react icons. This machine is missing `node.exe` — use `bun run test`/`bun run <script>` and `bunx tsc --noEmit`, never `npm`/`npx`.

**Spec:** `docs/superpowers/specs/2026-08-11-attendance-summary-cards-design.md` — read it once at the start of Task 9 for the full "Data Fetching" and "UI" sections; earlier tasks only need the excerpts inlined below.

---

## File Structure

- **Modify** `src/lib/contacts.ts` — export the `APP_TIMEZONE` constant (currently private) so `attendance.ts` can reuse it.
- **Create** `src/lib/attendance.ts` — pure functions: business-timezone time parsing, daily-arrival derivation, averaging, schedule comparison, tier classification, motivational-phrase selection, and top-N ranking. No I/O, no Supabase imports.
- **Create** `src/lib/attendance.test.ts` — unit tests for every function above.
- **Create** `src/app/(app)/AttendanceSummaryCards.tsx` — the 3-card presentational component. Takes fully-computed data as props; no data fetching of its own.
- **Modify** `src/app/(app)/page.tsx` — fetch the data these cards need and render `<AttendanceSummaryCards>`.

---

## Task 1: Export `APP_TIMEZONE` from `contacts.ts`

**Files:**
- Modify: `src/lib/contacts.ts:99`

- [ ] **Step 1: Change the constant to an export**

In `src/lib/contacts.ts`, change:

```typescript
const APP_TIMEZONE = "America/Santo_Domingo";
```

to:

```typescript
export const APP_TIMEZONE = "America/Santo_Domingo";
```

This is the only change in this file. `getBusinessToday()` below it keeps working exactly as before — it already referenced this constant by its local name.

- [ ] **Step 2: Verify nothing broke**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bun run test -- contacts.test.ts`
Expected: all existing tests in `src/lib/contacts.test.ts` still pass (this change doesn't alter behavior, only visibility).

- [ ] **Step 3: Commit**

```bash
git add src/lib/contacts.ts
git commit -m "refactor: export APP_TIMEZONE so attendance.ts can reuse it"
```

---

## Task 2: `attendance.ts` — business-timezone time parsing and daily arrivals

**Files:**
- Create: `src/lib/attendance.ts`
- Create: `src/lib/attendance.test.ts`

This task creates the file and its two most foundational functions: converting a raw punch timestamp into a business-timezone calendar day + minute-of-day, and reducing a list of raw punch timestamps down to one "arrival" per day (the earliest punch).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/attendance.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { toBusinessTimeParts, deriveDailyArrivals } from "./attendance";

describe("toBusinessTimeParts", () => {
  it("converts a UTC timestamp to the business-timezone calendar day and minutes-since-midnight", () => {
    // 2026-01-15T12:30:00Z is 2026-01-15 08:30 in America/Santo_Domingo (UTC-4)
    const result = toBusinessTimeParts("2026-01-15T12:30:00.000Z");
    expect(result).toEqual({ dateIso: "2026-01-15", minutesSinceMidnight: 8 * 60 + 30 });
  });

  it("handles a timestamp that crosses the UTC day boundary but not the business-timezone day boundary", () => {
    // 2026-01-15T02:00:00Z is still 2026-01-14 22:00 in America/Santo_Domingo -
    // a naive UTC-calendar read would say "the 15th", the business day is "the 14th"
    const result = toBusinessTimeParts("2026-01-15T02:00:00.000Z");
    expect(result).toEqual({ dateIso: "2026-01-14", minutesSinceMidnight: 22 * 60 });
  });

  it("resolves exactly business-timezone midnight to minute 0", () => {
    // 2026-01-01T04:00:00Z is exactly 2026-01-01 00:00 in America/Santo_Domingo
    const result = toBusinessTimeParts("2026-01-01T04:00:00.000Z");
    expect(result).toEqual({ dateIso: "2026-01-01", minutesSinceMidnight: 0 });
  });
});

describe("deriveDailyArrivals", () => {
  it("keeps only the earliest punch per business-timezone day", () => {
    const result = deriveDailyArrivals([
      "2026-01-15T13:00:00.000Z", // 09:00 local
      "2026-01-15T12:30:00.000Z", // 08:30 local - earlier, should win
      "2026-01-15T18:00:00.000Z", // 14:00 local - a later punch same day, ignored
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30 }]);
  });

  it("returns one entry per distinct day, sorted by date ascending", () => {
    const result = deriveDailyArrivals([
      "2026-01-16T12:00:00.000Z", // 08:00 local, the 16th
      "2026-01-15T12:30:00.000Z", // 08:30 local, the 15th
    ]);
    expect(result).toEqual([
      { dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30 },
      { dateIso: "2026-01-16", arrivalMinutes: 8 * 60 },
    ]);
  });

  it("returns an empty array for no punches", () => {
    expect(deriveDailyArrivals([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `src/lib/attendance.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add business-timezone punch parsing and daily-arrival derivation"
```

---

## Task 3: `attendance.ts` — averaging and time formatting

**Files:**
- Modify: `src/lib/attendance.ts`
- Modify: `src/lib/attendance.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/attendance.test.ts` (add this `import` name to the existing import line at the top, and add these two `describe` blocks anywhere after the existing ones):

Change the top import line from:

```typescript
import { toBusinessTimeParts, deriveDailyArrivals } from "./attendance";
```

to:

```typescript
import { toBusinessTimeParts, deriveDailyArrivals, averageArrivalMinutes, formatArrivalTime } from "./attendance";
```

Then append:

```typescript
describe("averageArrivalMinutes", () => {
  it("returns null for an empty list", () => {
    expect(averageArrivalMinutes([])).toBeNull();
  });

  it("returns the arrival time itself for a single day", () => {
    expect(averageArrivalMinutes([{ dateIso: "2026-01-15", arrivalMinutes: 480 }])).toBe(480);
  });

  it("averages the arrival minutes across multiple days", () => {
    const result = averageArrivalMinutes([
      { dateIso: "2026-01-15", arrivalMinutes: 480 },
      { dateIso: "2026-01-16", arrivalMinutes: 500 },
    ]);
    expect(result).toBe(490);
  });
});

describe("formatArrivalTime", () => {
  it("formats a morning time with am", () => {
    expect(formatArrivalTime(8 * 60)).toBe("8:00 am");
  });

  it("formats an afternoon time with pm", () => {
    expect(formatArrivalTime(17 * 60)).toBe("5:00 pm");
  });

  it("formats midnight as 12:00 am", () => {
    expect(formatArrivalTime(0)).toBe("12:00 am");
  });

  it("formats noon as 12:00 pm", () => {
    expect(formatArrivalTime(12 * 60)).toBe("12:00 pm");
  });

  it("zero-pads the minute", () => {
    expect(formatArrivalTime(9 * 60 + 5)).toBe("9:05 am");
  });

  it("rounds a fractional minute count before formatting", () => {
    // averageArrivalMinutes can return a fractional average across several days
    expect(formatArrivalTime(8 * 60 + 30.6)).toBe("8:31 am");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `averageArrivalMinutes` and `formatArrivalTime` are not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add arrival averaging and time formatting to attendance.ts"
```

---

## Task 4: `attendance.ts` — schedule comparison

**Files:**
- Modify: `src/lib/attendance.ts`
- Modify: `src/lib/attendance.test.ts`

This introduces `scheduleTimeToMinutes` (a small exported helper converting a `"HH:MM:SS"` schedule time into minutes-since-midnight, reused later in `page.tsx` for the Card 3 ranking) and `attachScheduleComparison`/`averageMinutesEarly`, which compare each arrival against the contact's effective schedule from `src/lib/schedules.ts`.

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` from:

```typescript
import { toBusinessTimeParts, deriveDailyArrivals, averageArrivalMinutes, formatArrivalTime } from "./attendance";
```

to:

```typescript
import {
  toBusinessTimeParts,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
} from "./attendance";
```

Then append:

```typescript
describe("scheduleTimeToMinutes", () => {
  it("converts an HH:MM:SS schedule time to minutes since midnight", () => {
    expect(scheduleTimeToMinutes("08:00:00")).toBe(480);
    expect(scheduleTimeToMinutes("17:30:00")).toBe(1050);
    expect(scheduleTimeToMinutes("00:00:00")).toBe(0);
  });
});

describe("attachScheduleComparison", () => {
  // Monday-Friday 8:00 am, tolerance irrelevant to this function
  const schedule = {
    id: "s1",
    name: "General",
    tolerance_minutes: 0,
    days: [1, 2, 3, 4, 5].map((day_of_week) => ({
      day_of_week,
      start_time: "08:00:00",
      end_time: "17:00:00",
    })),
  };

  it("computes minutesEarly as positive when arriving before the scheduled start", () => {
    // 2026-01-14 is a Wednesday
    const result = attachScheduleComparison([{ dateIso: "2026-01-14", arrivalMinutes: 470 }], schedule);
    expect(result).toEqual([{ dateIso: "2026-01-14", arrivalMinutes: 470, minutesEarly: 10 }]);
  });

  it("computes minutesEarly as negative when arriving after the scheduled start", () => {
    const result = attachScheduleComparison([{ dateIso: "2026-01-14", arrivalMinutes: 490 }], schedule);
    expect(result[0].minutesEarly).toBe(-10);
  });

  it("returns null minutesEarly for a day the schedule doesn't work (e.g. a Sunday)", () => {
    // 2026-01-18 is a Sunday - not in this schedule's days
    const result = attachScheduleComparison([{ dateIso: "2026-01-18", arrivalMinutes: 480 }], schedule);
    expect(result).toEqual([{ dateIso: "2026-01-18", arrivalMinutes: 480, minutesEarly: null }]);
  });
});

describe("averageMinutesEarly", () => {
  it("returns null when every entry has a null minutesEarly", () => {
    const result = averageMinutesEarly([
      { dateIso: "2026-01-18", arrivalMinutes: 480, minutesEarly: null },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(averageMinutesEarly([])).toBeNull();
  });

  it("averages only the non-null entries, ignoring null ones", () => {
    const result = averageMinutesEarly([
      { dateIso: "2026-01-14", arrivalMinutes: 470, minutesEarly: 10 },
      { dateIso: "2026-01-15", arrivalMinutes: 490, minutesEarly: -10 },
      { dateIso: "2026-01-18", arrivalMinutes: 480, minutesEarly: null },
    ]);
    expect(result).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `scheduleTimeToMinutes`, `attachScheduleComparison`, and `averageMinutesEarly` are not exported yet.

- [ ] **Step 3: Write the implementation**

Add this import to the top of `src/lib/attendance.ts` (alongside the existing `APP_TIMEZONE` import):

```typescript
import type { ScheduleTemplate } from "./schedules";
```

Append to `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add schedule comparison to attendance.ts"
```

---

## Task 5: `attendance.ts` — arrival tier classification

**Files:**
- Modify: `src/lib/attendance.ts`
- Modify: `src/lib/attendance.test.ts`

This implements the 5-tier boundaries from the spec's "Motivational Message (Card 1)" table: more than 15 min late → `muy_tarde`; late beyond tolerance but not more than 15 min → `un_poco_tarde`; within `±tolerance_minutes` → `a_tiempo`; more than tolerance early but less than 10 min → `temprano`; 10+ min early → `muy_temprano`.

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` to add `classifyArrivalTier`:

```typescript
import {
  toBusinessTimeParts,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
} from "./attendance";
```

Then append:

```typescript
describe("classifyArrivalTier", () => {
  it("classifies more than 15 minutes late as muy_tarde", () => {
    expect(classifyArrivalTier(-16, 0)).toBe("muy_tarde");
  });

  it("classifies exactly 15 minutes late as un_poco_tarde, not muy_tarde", () => {
    expect(classifyArrivalTier(-15, 0)).toBe("un_poco_tarde");
  });

  it("classifies late beyond tolerance but within 15 minutes as un_poco_tarde", () => {
    expect(classifyArrivalTier(-5, 0)).toBe("un_poco_tarde");
  });

  it("classifies exactly on time (average equals 0, zero tolerance) as a_tiempo", () => {
    expect(classifyArrivalTier(0, 0)).toBe("a_tiempo");
  });

  it("classifies within a non-zero tolerance as a_tiempo, even if technically late", () => {
    expect(classifyArrivalTier(-3, 5)).toBe("a_tiempo");
  });

  it("classifies within a non-zero tolerance as a_tiempo, even if technically early", () => {
    expect(classifyArrivalTier(3, 5)).toBe("a_tiempo");
  });

  it("classifies more than tolerance early but under 10 minutes as temprano", () => {
    expect(classifyArrivalTier(6, 5)).toBe("temprano");
  });

  it("classifies just under 10 minutes early as temprano, not muy_temprano", () => {
    expect(classifyArrivalTier(9, 0)).toBe("temprano");
  });

  it("classifies exactly 10 minutes early as muy_temprano", () => {
    expect(classifyArrivalTier(10, 0)).toBe("muy_temprano");
  });

  it("classifies well over 10 minutes early as muy_temprano", () => {
    expect(classifyArrivalTier(25, 0)).toBe("muy_temprano");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `classifyArrivalTier` is not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (32 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add arrival tier classification to attendance.ts"
```

---

## Task 6: `attendance.ts` — motivational phrase pool and selection

**Files:**
- Modify: `src/lib/attendance.ts`
- Modify: `src/lib/attendance.test.ts`

This adds the 12-phrase pool (verbatim Spanish text from the spec's "Motivational Message (Card 1)" section) and `pickMotivationalPhrase`, which selects deterministically by day-of-month and substitutes `{name}`.

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` to add `pickMotivationalPhrase`:

```typescript
import {
  toBusinessTimeParts,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
} from "./attendance";
```

Then append:

```typescript
describe("pickMotivationalPhrase", () => {
  it("substitutes {name} into the selected phrase", () => {
    const result = pickMotivationalPhrase("a_tiempo", "Carlos", 0);
    expect(result).toContain("Carlos");
    expect(result).not.toContain("{name}");
  });

  it("returns the same phrase for the same tier and day of month every time", () => {
    const first = pickMotivationalPhrase("temprano", "Ana", 5);
    const second = pickMotivationalPhrase("temprano", "Ana", 5);
    expect(first).toBe(second);
  });

  it("can return different phrases from the same tier's pool on different days", () => {
    // muy_tarde has 3 phrases; day 0 and day 1 select different pool indices
    const dayZero = pickMotivationalPhrase("muy_tarde", "Ana", 0);
    const dayOne = pickMotivationalPhrase("muy_tarde", "Ana", 1);
    expect(dayZero).not.toBe(dayOne);
  });

  it("only ever returns a phrase belonging to the requested tier", () => {
    for (let day = 0; day < 31; day++) {
      const result = pickMotivationalPhrase("muy_temprano", "Ana", day);
      expect(result.includes("primeros") || result.includes("disciplina") || result.includes("máquina")).toBe(
        true,
      );
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `pickMotivationalPhrase` is not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (36 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add motivational phrase pool and selection to attendance.ts"
```

---

## Task 7: `attendance.ts` — top-N early-arrival ranking

**Files:**
- Modify: `src/lib/attendance.ts`
- Modify: `src/lib/attendance.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` to add `rankEarlyArrivals`:

```typescript
import {
  toBusinessTimeParts,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
} from "./attendance";
```

Then append:

```typescript
describe("rankEarlyArrivals", () => {
  function candidate(overrides: Partial<Parameters<typeof rankEarlyArrivals>[0][number]>) {
    return {
      contactId: "id",
      name: "Someone",
      photoUrl: null,
      arrivalMinutes: 480,
      scheduledStartMinutes: 480,
      ...overrides,
    };
  }

  it("sorts by minutesEarly descending", () => {
    const result = rankEarlyArrivals(
      [
        candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }), // 10 early
        candidate({ contactId: "b", arrivalMinutes: 460, scheduledStartMinutes: 480 }), // 20 early
        candidate({ contactId: "c", arrivalMinutes: 475, scheduledStartMinutes: 480 }), // 5 early
      ],
      5,
    );
    expect(result.map((r) => r.contactId)).toEqual(["b", "a", "c"]);
  });

  it("excludes anyone who arrived late (negative minutesEarly)", () => {
    const result = rankEarlyArrivals(
      [
        candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }), // 10 early
        candidate({ contactId: "b", arrivalMinutes: 490, scheduledStartMinutes: 480 }), // 10 late
      ],
      5,
    );
    expect(result.map((r) => r.contactId)).toEqual(["a"]);
  });

  it("keeps someone who arrived exactly on time (minutesEarly = 0)", () => {
    const result = rankEarlyArrivals([candidate({ contactId: "a", arrivalMinutes: 480, scheduledStartMinutes: 480 })], 5);
    expect(result.map((r) => r.contactId)).toEqual(["a"]);
  });

  it("limits the result to the requested count", () => {
    const candidates = [
      candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }),
      candidate({ contactId: "b", arrivalMinutes: 460, scheduledStartMinutes: 480 }),
      candidate({ contactId: "c", arrivalMinutes: 450, scheduledStartMinutes: 480 }),
    ];
    const result = rankEarlyArrivals(candidates, 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.contactId)).toEqual(["c", "b"]);
  });

  it("preserves input order for exact ties", () => {
    const result = rankEarlyArrivals(
      [
        candidate({ contactId: "a", arrivalMinutes: 470, scheduledStartMinutes: 480 }),
        candidate({ contactId: "b", arrivalMinutes: 470, scheduledStartMinutes: 480 }),
      ],
      5,
    );
    expect(result.map((r) => r.contactId)).toEqual(["a", "b"]);
  });

  it("returns an empty array for no candidates", () => {
    expect(rankEarlyArrivals([], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `rankEarlyArrivals` is not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (42 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add top-N early-arrival ranking to attendance.ts"
```

---

## Task 8: `AttendanceSummaryCards.tsx` component

**Files:**
- Create: `src/app/(app)/AttendanceSummaryCards.tsx`

This is a pure presentational component - it receives fully-computed data as props and renders the 3-card responsive grid. No data fetching here (that's Task 9). No test file for this component: this codebase has no component-level tests anywhere (`BirthdaysWidget.tsx`, `MyProfileCard.tsx`, `ContactsCards.tsx` etc. are all untested at this layer) - `attendance.ts`'s unit tests already cover every computation this component displays.

- [ ] **Step 1: Write the component**

Create `src/app/(app)/AttendanceSummaryCards.tsx`:

```tsx
import { Clock, Trophy, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/contacts";

export interface AttendanceCard1Data {
  averageArrivalLabel: string | null; // formatted time, or null for "no data this month"
  phrase: string | null; // personalized motivational phrase, or null if there's no average to base it on
}

export interface AttendanceCard2Data {
  arrivalLabel: string | null; // formatted time, or null for "haven't punched in yet today"
  minutesEarly: number | null; // null if today wasn't a scheduled workday, or there's no arrival yet
}

export interface AttendanceTopArrival {
  contactId: string;
  name: string;
  photoUrl: string | null;
  arrivalLabel: string;
  minutesEarly: number;
}

export function AttendanceSummaryCards({
  card1,
  card2,
  topArrivals,
}: {
  card1: AttendanceCard1Data;
  card2: AttendanceCard2Data;
  topArrivals: AttendanceTopArrival[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <TrendingUp className="size-4 text-[#04B1AF]" />
          Mi promedio
        </div>
        <p className="mt-2 text-2xl font-bold">{card1.averageArrivalLabel ?? "Sin datos este mes"}</p>
        {card1.phrase && <p className="mt-1 text-sm text-muted-foreground">{card1.phrase}</p>}
      </div>

      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Clock className="size-4 text-[#04B1AF]" />
          Mi llegada de hoy
        </div>
        <p className="mt-2 text-2xl font-bold">{card2.arrivalLabel ?? "Aún no has ponchado hoy"}</p>
        {card2.arrivalLabel && card2.minutesEarly !== null && (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{Math.abs(card2.minutesEarly)} min</span>{" "}
            {card2.minutesEarly >= 0 ? "antes de tu horario" : "después de tu horario"}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5 sm:col-span-2 lg:col-span-2">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Trophy className="size-4 text-[#04B1AF]" />
          Top 5 de hoy
        </div>
        {topArrivals.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Aún no hay llegadas registradas hoy.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {topArrivals.map((arrival, index) => (
              <div key={arrival.contactId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <Avatar className="size-8 shrink-0">
                  <AvatarImage src={arrival.photoUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">{getInitials(arrival.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{arrival.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Llegó a las {arrival.arrivalLabel}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#04B1AF]/10 px-2.5 py-1 text-xs font-bold text-[#04B1AF]">
                  {arrival.minutesEarly} min antes
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors. (This component isn't imported anywhere yet, so this only checks the file in isolation - a real usage check happens in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/AttendanceSummaryCards.tsx"
git commit -m "feat: add the AttendanceSummaryCards presentational component"
```

---

## Task 9: Wire data fetching into `page.tsx`

**Files:**
- Modify: `src/app/(app)/page.tsx`

Before starting, read the spec's "Data Fetching" section in `docs/superpowers/specs/2026-08-11-attendance-summary-cards-design.md` for the full rationale. The short version: two of the three queries below use `createAdminClient()` (from `src/lib/supabase/admin.ts`) rather than the page's existing session-scoped `createClient()`, because `time_clock_punches` has no SELECT policy at all (only the service-role client can read it) and the "every active contact with a ponchador code, company-wide" query for Card 3 would otherwise be blocked by `contacts_select`'s RLS policy for any viewer who doesn't personally have `can_view` on the `contacts` module. Using the admin client only for these two specific queries keeps the exposure limited to exactly what this feature computes and renders - it does not add any new RLS policy or open up direct table access to anyone.

- [ ] **Step 1: Update imports**

In `src/app/(app)/page.tsx`, replace the import block:

```typescript
import { createClient } from "@/lib/supabase/server";
import { getBusinessToday, getUpcomingBirthdays, splitTodayBirthdays, type BirthdayContact } from "@/lib/contacts";
import { resolveScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";
import type { MyProfileCardData } from "./contacts/MyProfileCard";
```

with:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessToday, getUpcomingBirthdays, splitTodayBirthdays, type BirthdayContact } from "@/lib/contacts";
import { getEffectiveSchedule, resolveScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import {
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
  scheduleTimeToMinutes,
  type EarlyArrivalCandidate,
} from "@/lib/attendance";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";
import type { MyProfileCardData } from "./contacts/MyProfileCard";
import {
  AttendanceSummaryCards,
  type AttendanceCard1Data,
  type AttendanceCard2Data,
  type AttendanceTopArrival,
} from "./AttendanceSummaryCards";
```

- [ ] **Step 2: Add `hikvision_employee_no` to the viewer's own contact fetch**

Change:

```typescript
    const { data: myContact } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date, schedule_id, department_id")
      .eq("email", user.email)
      .maybeSingle();
```

to:

```typescript
    const { data: myContact } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date, schedule_id, department_id, hikvision_employee_no")
      .eq("email", user.email)
      .maybeSingle();
```

- [ ] **Step 3: Compute the attendance cards' data**

Immediately after the `if (myContact) { ... }` block that sets `myProfile` (i.e. right after that block's closing `}`, still inside the outer `if (user?.email) { ... }` block), add:

```typescript
    let attendanceCards: {
      card1: AttendanceCard1Data;
      card2: AttendanceCard2Data;
      topArrivals: AttendanceTopArrival[];
    } | null = null;

    if (myContact?.hikvision_employee_no) {
      const admin = createAdminClient();
      const windowStartIso = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

      const { data: myPunches } = await admin
        .from("time_clock_punches")
        .select("punched_at")
        .eq("employee_no_string", myContact.hikvision_employee_no)
        .gte("punched_at", windowStartIso);

      const myArrivals = deriveDailyArrivals((myPunches ?? []).map((p) => p.punched_at));
      const monthStartIso = `${todayIso.slice(0, 7)}-01`;
      const monthlyArrivals = myArrivals.filter((a) => a.dateIso >= monthStartIso);
      const avgArrivalMinutes = averageArrivalMinutes(monthlyArrivals);

      const viewerSchedule = getEffectiveSchedule(
        myContact.schedule_id,
        myContact.department_id ? departmentDefaultById.get(myContact.department_id) : null,
        schedulesById,
        defaultSchedule,
      );
      const monthlyComparison = attachScheduleComparison(monthlyArrivals, viewerSchedule);
      const avgMinutesEarly = averageMinutesEarly(monthlyComparison);

      let phrase: string | null = null;
      if (avgMinutesEarly !== null) {
        const tier = classifyArrivalTier(avgMinutesEarly, viewerSchedule.tolerance_minutes);
        phrase = pickMotivationalPhrase(tier, myContact.first_name, today.getUTCDate());
      }

      const todayComparison = monthlyComparison.find((a) => a.dateIso === todayIso) ?? null;

      const card1: AttendanceCard1Data = {
        averageArrivalLabel: avgArrivalMinutes === null ? null : formatArrivalTime(avgArrivalMinutes),
        phrase,
      };
      const card2: AttendanceCard2Data = {
        arrivalLabel: todayComparison === null ? null : formatArrivalTime(todayComparison.arrivalMinutes),
        minutesEarly: todayComparison?.minutesEarly ?? null,
      };

      const { data: candidateContacts } = await admin
        .from("contacts")
        .select("id, first_name, last_name, photo_url, schedule_id, department_id, hikvision_employee_no")
        .eq("status", "active")
        .not("hikvision_employee_no", "is", null);

      const employeeNumbers = (candidateContacts ?? [])
        .map((c) => c.hikvision_employee_no)
        .filter((no): no is string => Boolean(no));

      const punchesByEmployeeNo = new Map<string, string[]>();
      if (employeeNumbers.length > 0) {
        const { data: allPunches } = await admin
          .from("time_clock_punches")
          .select("employee_no_string, punched_at")
          .in("employee_no_string", employeeNumbers)
          .gte("punched_at", windowStartIso);
        for (const punch of allPunches ?? []) {
          const list = punchesByEmployeeNo.get(punch.employee_no_string) ?? [];
          list.push(punch.punched_at);
          punchesByEmployeeNo.set(punch.employee_no_string, list);
        }
      }

      const todayDayOfWeek = today.getUTCDay();
      const candidates: EarlyArrivalCandidate[] = [];
      for (const c of candidateContacts ?? []) {
        const employeeNo = c.hikvision_employee_no as string;
        const arrivals = deriveDailyArrivals(punchesByEmployeeNo.get(employeeNo) ?? []);
        const todayArrival = arrivals.find((a) => a.dateIso === todayIso);
        if (!todayArrival) continue;

        const contactSchedule = getEffectiveSchedule(
          c.schedule_id,
          c.department_id ? departmentDefaultById.get(c.department_id) : null,
          schedulesById,
          defaultSchedule,
        );
        const scheduledDay = contactSchedule.days.find((d) => d.day_of_week === todayDayOfWeek);
        if (!scheduledDay) continue;

        candidates.push({
          contactId: c.id,
          name: `${c.first_name} ${c.last_name}`,
          photoUrl: c.photo_url,
          arrivalMinutes: todayArrival.arrivalMinutes,
          scheduledStartMinutes: scheduleTimeToMinutes(scheduledDay.start_time),
        });
      }

      const topArrivals: AttendanceTopArrival[] = rankEarlyArrivals(candidates, 5).map((r) => ({
        contactId: r.contactId,
        name: r.name,
        photoUrl: r.photoUrl,
        arrivalLabel: formatArrivalTime(r.arrivalMinutes),
        minutesEarly: r.minutesEarly,
      }));

      attendanceCards = { card1, card2, topArrivals };
    }
```

Note: `departmentDefaultById`, `schedulesById`, `defaultSchedule`, `today`, and `todayIso` are all already defined earlier in this same function (used by the birthdays/profile code above) - this step reuses them rather than re-fetching.

- [ ] **Step 4: Render the cards**

Change the `return` statement from:

```tsx
  return (
    <div className="space-y-4 p-6">
      {!myProfile && (
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Bienvenido</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      )}
      <BirthdaysWidget
        myProfile={myProfile}
        today={today}
        todayContacts={todayBirthdays}
        upcomingContacts={upcomingBirthdays}
        events={upcomingEvents ?? []}
        news={activeNews ?? []}
      />
    </div>
  );
```

to:

```tsx
  return (
    <div className="space-y-4 p-6">
      {!myProfile && (
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Bienvenido</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      )}
      {attendanceCards && (
        <AttendanceSummaryCards
          card1={attendanceCards.card1}
          card2={attendanceCards.card2}
          topArrivals={attendanceCards.topArrivals}
        />
      )}
      <BirthdaysWidget
        myProfile={myProfile}
        today={today}
        todayContacts={todayBirthdays}
        upcomingContacts={upcomingBirthdays}
        events={upcomingEvents ?? []}
        news={activeNews ?? []}
      />
    </div>
  );
```

- [ ] **Step 5: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bun run test`
Expected: all tests pass (aside from any pre-existing, unrelated Supabase-auth rate-limit flakiness - if a failure's message is exactly "Request rate limit reached" in a file this plan didn't touch, it's not a regression; re-run to confirm).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: fetch attendance data and render the summary cards on the home page"
```

---

## Self-Review Notes

- **Spec coverage:** Card 1 (average + phrase) → Task 9 Step 3 + Task 6. Card 2 (today's arrival) → Task 9 Step 3. Card 3 (top 5) → Task 9 Step 3 + Task 7. Visibility gate (`hikvision_employee_no`) → Task 9 Step 3's `if (myContact?.hikvision_employee_no)` guard and Step 4's `{attendanceCards && ...}`. `APP_TIMEZONE` export → Task 1. Responsive grid (`grid-cols-1` → `sm:grid-cols-2` with Top5 `sm:col-span-2` → `lg:grid-cols-4` with Top5 `lg:col-span-2`) → Task 8. All 9 pure functions and both new types (`ArrivalTier`, `EarlyArrivalCandidate`/`EarlyArrivalRanking`) → Tasks 2–7, each with unit tests per the spec's Testing section. Admin-client access decisions → Task 9's intro note.
- **Type consistency check:** `EarlyArrivalCandidate`/`EarlyArrivalRanking` (Task 7) match the fields `page.tsx` builds in Task 9 Step 3 (`contactId`, `name`, `photoUrl`, `arrivalMinutes`, `scheduledStartMinutes`, plus the ranking's added `minutesEarly`). `AttendanceCard1Data`/`AttendanceCard2Data`/`AttendanceTopArrival` (Task 8) match exactly what Task 9 Step 3 constructs and Step 4 passes as props.
- **No new migration:** confirmed against the spec's Computation Model section - this feature reads existing tables only.
