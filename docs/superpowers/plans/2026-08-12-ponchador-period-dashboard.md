# Ponchador Period Dashboard (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/ponchador`'s single-stat dashboard with a period-navigable one: 4 summary stat cards, a day-by-day table with Estado (Puntual/Llegada tarde/Salida anticipada/Ausente/Permiso) and Observación, a Resumen panel, the existing motivational phrase, and a schedule footer note.

**Architecture:** Two new pure functions in `src/lib/attendance.ts` enumerate every scheduled workday in a period and classify each one, cross-referencing approved `vacation_requests` for "Permiso." A new client component `PeriodFilter.tsx` navigates via URL query params (`?year=&month=`), so the Server Component `page.tsx` does all the fetching/computation with no client-side data fetching at all. `PonchadorDashboard.tsx` is rewritten to render the full layout from fully pre-formatted props.

**Tech Stack:** Next.js Server Components + a `"use client"` filter component, Supabase (session-scoped client only, no admin client, no new RLS), TypeScript, Vitest, the existing shadcn `Select`/`Table`/`Badge` components. This machine is missing `node.exe` - use `bun run test`/`bun run <script>` and `bunx tsc --noEmit`, never `npm`/`npx`.

**Spec:** `docs/superpowers/specs/2026-08-12-ponchador-period-dashboard-design.md`.

---

## File Structure

- **Modify** `src/lib/attendance.ts` - add `buildAttendancePeriodRows`, `summarizeAttendancePeriod`, `classifyPuntualidadLabel`, and two small private helpers (`enumerateDateRange`, `isDateInRange`).
- **Modify** `src/lib/attendance.test.ts` - tests for the three new exported functions.
- **Create** `src/app/(app)/ponchador/PeriodFilter.tsx` - client component, Año/Mes `Select`s + a disabled "Semana" button, navigates via `useRouter`.
- **Modify** `src/app/(app)/ponchador/PonchadorDashboard.tsx` - full rewrite: 4 stat cards, Estado/Observación table, Resumen panel, motivational box, footer note.
- **Modify** `src/app/(app)/ponchador/page.tsx` - reads `searchParams`, resolves the viewer's effective schedule, fetches punches + approved leave for the selected period, computes everything, renders the new dashboard.

---

## Task 1: `attendance.ts` — period rows, summary, and the puntualidad label

**Files:**
- Modify: `src/lib/attendance.ts` (append at the end of the file)
- Modify: `src/lib/attendance.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` from:

```typescript
import {
  toBusinessTimeParts,
  buildDailyAttendanceRows,
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

to:

```typescript
import {
  toBusinessTimeParts,
  buildDailyAttendanceRows,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
  buildAttendancePeriodRows,
  summarizeAttendancePeriod,
  classifyPuntualidadLabel,
} from "./attendance";
```

Then append this to the end of `src/lib/attendance.test.ts`:

```typescript

describe("buildAttendancePeriodRows", () => {
  // Monday-Friday 8:00 am - 5:00 pm, zero tolerance unless a test overrides it.
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

  it("marks a scheduled day covered by approved leave as permiso, even with no punch", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "permiso",
        observacion: "Permiso aprobado",
      },
    ]);
  });

  it("marks a scheduled day with no punch and no leave as ausente", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-12", schedule, [], [], 15);
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "ausente",
        observacion: "Sin justificación",
      },
    ]);
  });

  it("marks a late arrival as llegada_tarde, with the exact minute count in the observación", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 17 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60 + 20,
        exitMinutes: 17 * 60,
        workedMinutes: 17 * 60 - (8 * 60 + 20),
        estado: "llegada_tarde",
        observacion: "20 min tarde",
      },
    ]);
  });

  it("marks an on-time arrival with an early exit beyond the threshold as salida_anticipada", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 16 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 16 * 60,
        workedMinutes: 16 * 60 - 8 * 60,
        estado: "salida_anticipada",
        observacion: "60 min antes",
      },
    ]);
  });

  it("prioritizes llegada_tarde over salida_anticipada when both apply the same day", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 16 * 60 }],
      [],
      15,
    );
    expect(result[0].estado).toBe("llegada_tarde");
  });

  it("marks a fully on-time day as puntual", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 17 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 17 * 60,
        workedMinutes: 9 * 60,
        estado: "puntual",
        observacion: "—",
      },
    ]);
  });

  it("excludes a day that isn't scheduled for this schedule", () => {
    // 2026-01-11 is a Sunday - not in schedule.days
    const result = buildAttendancePeriodRows("2026-01-11", "2026-01-11", schedule, [], [], 15);
    expect(result).toEqual([]);
  });

  it("enumerates only scheduled days across a range that includes a weekend", () => {
    // 2026-01-09 Fri, 01-10 Sat, 01-11 Sun, 01-12 Mon - only Fri and Mon are scheduled
    const result = buildAttendancePeriodRows("2026-01-09", "2026-01-12", schedule, [], [], 15);
    expect(result.map((r) => r.dateIso)).toEqual(["2026-01-09", "2026-01-12"]);
  });

  it("returns an empty array when periodEndIso is before periodStartIso", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-11", schedule, [], [], 15);
    expect(result).toEqual([]);
  });
});

describe("summarizeAttendancePeriod", () => {
  it("counts each estado and computes derived stats for a mixed period", () => {
    const rows = [
      { dateIso: "2026-01-05", arrivalMinutes: 480, exitMinutes: 1020, workedMinutes: 540, estado: "puntual" as const, observacion: "—" },
      { dateIso: "2026-01-06", arrivalMinutes: 500, exitMinutes: 1020, workedMinutes: 520, estado: "llegada_tarde" as const, observacion: "20 min tarde" },
      { dateIso: "2026-01-07", arrivalMinutes: 480, exitMinutes: 960, workedMinutes: 480, estado: "salida_anticipada" as const, observacion: "60 min antes" },
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación" },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado" },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result).toEqual({
      diasHabiles: 5,
      diasTrabajados: 3,
      puntuales: 1,
      llegadasTarde: 1,
      salidasAnticipadas: 1,
      ausencias: 1,
      permisos: 1,
      feriados: 0,
      horasTrabajadasMinutes: 540 + 520 + 480,
      promedioEntradaMinutes: (480 + 500 + 480) / 3,
      puntualidadPercent: Math.round((1 / 3) * 100),
    });
  });

  it("returns null-safe stats for a period with zero días trabajados", () => {
    const rows = [
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación" },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado" },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result.diasTrabajados).toBe(0);
    expect(result.promedioEntradaMinutes).toBeNull();
    expect(result.puntualidadPercent).toBeNull();
    expect(result.horasTrabajadasMinutes).toBe(0);
    expect(result.feriados).toBe(0);
  });
});

describe("classifyPuntualidadLabel", () => {
  it("classifies below 85 as A mejorar", () => {
    expect(classifyPuntualidadLabel(84)).toBe("A mejorar");
  });

  it("classifies exactly 85 as Buena", () => {
    expect(classifyPuntualidadLabel(85)).toBe("Buena");
  });

  it("classifies just under 95 as Buena", () => {
    expect(classifyPuntualidadLabel(94)).toBe("Buena");
  });

  it("classifies exactly 95 as Excelente", () => {
    expect(classifyPuntualidadLabel(95)).toBe("Excelente");
  });

  it("returns null for null input", () => {
    expect(classifyPuntualidadLabel(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL - `buildAttendancePeriodRows`, `summarizeAttendancePeriod`, and `classifyPuntualidadLabel` are not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/attendance.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (68 tests - the existing 51, plus 9 `buildAttendancePeriodRows` tests, 2 `summarizeAttendancePeriod` tests, 5 `classifyPuntualidadLabel` tests, 1 additional shared-fixture setup line that isn't its own test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add period-based attendance classification to attendance.ts"
```

---

## Task 2: `PeriodFilter.tsx` component

**Files:**
- Create: `src/app/(app)/ponchador/PeriodFilter.tsx`

No test file - this codebase has no component-level tests anywhere.

- [ ] **Step 1: Write the component**

Create `src/app/(app)/ponchador/PeriodFilter.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function PeriodFilter({
  year,
  month,
  currentYear,
  currentMonth,
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/ponchador?${params.toString()}`);
  }

  const years = [currentYear - 2, currentYear - 1, currentYear];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={String(year)} onValueChange={(value) => value && updateParam("year", value)}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(month)} onValueChange={(value) => value && updateParam("month", value)}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES_ES.map((label, index) => {
            const monthNumber = index + 1;
            const disabled = year === currentYear && monthNumber > currentMonth;
            return (
              <SelectItem key={monthNumber} value={String(monthNumber)} disabled={disabled}>
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <button
        type="button"
        disabled
        title="Próximamente"
        className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground opacity-50"
      >
        Semana
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors. (Not imported anywhere yet - a real usage check happens in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PeriodFilter.tsx"
git commit -m "feat: add the PeriodFilter client component"
```

---

## Task 3: `PonchadorDashboard.tsx` rewrite

**Files:**
- Modify: `src/app/(app)/ponchador/PonchadorDashboard.tsx`

The current full content of this file is:

```tsx
import { CalendarClock, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PonchadorRow {
  dateIso: string;
  dateLabel: string;
  arrivalLabel: string | null;
  exitLabel: string | null;
}

export function PonchadorDashboard({
  averageArrivalLabel,
  rows,
}: {
  averageArrivalLabel: string | null;
  rows: PonchadorRow[];
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <TrendingUp className="size-4 text-[#04B1AF]" />
          Promedio de llegada este mes
        </div>
        <p className="mt-2 text-2xl font-bold">{averageArrivalLabel ?? "Sin datos este mes"}</p>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4 text-muted-foreground" />
          Registro del mes
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay ponchadas registradas este mes.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.dateIso}>
                  <TableCell>{row.dateLabel}</TableCell>
                  <TableCell>{row.arrivalLabel ?? "—"}</TableCell>
                  <TableCell>{row.exitLabel ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Replace the whole file**

Replace the entire content of `src/app/(app)/ponchador/PonchadorDashboard.tsx` with:

```tsx
import { CalendarClock, Clock3, TrendingUp, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PeriodFilter } from "./PeriodFilter";

export interface PonchadorRow {
  dateIso: string;
  dateLabel: string;
  arrivalLabel: string | null;
  exitLabel: string | null;
  workedLabel: string | null;
  estado: "puntual" | "llegada_tarde" | "salida_anticipada" | "ausente" | "permiso";
  estadoLabel: string;
  observacion: string;
}

export interface PonchadorSummary {
  diasHabiles: number;
  diasTrabajados: number;
  puntuales: number;
  llegadasTarde: number;
  salidasAnticipadas: number;
  ausencias: number;
  permisos: number;
  feriados: number;
  horasTrabajadasLabel: string;
  promedioDiarioLabel: string;
}

const ESTADO_BADGE_CLASSNAMES: Record<PonchadorRow["estado"], string> = {
  puntual: "bg-emerald-100 text-emerald-700",
  llegada_tarde: "bg-amber-100 text-amber-700",
  salida_anticipada: "bg-orange-100 text-orange-700",
  ausente: "bg-red-100 text-red-700",
  permiso: "bg-blue-100 text-blue-700",
};

export function PonchadorDashboard({
  year,
  month,
  currentYear,
  currentMonth,
  periodLabel,
  averageArrivalLabel,
  averageArrivalDeltaLabel,
  diasTrabajadosLabel,
  puntualidadLabel,
  horasTrabajadasLabel,
  rows,
  summary,
  motivationalPhrase,
  scheduleFooterNote,
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
  periodLabel: string;
  averageArrivalLabel: string | null;
  averageArrivalDeltaLabel: string | null;
  diasTrabajadosLabel: string;
  puntualidadLabel: string;
  horasTrabajadasLabel: string;
  rows: PonchadorRow[];
  summary: PonchadorSummary;
  motivationalPhrase: string | null;
  scheduleFooterNote: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Período seleccionado</p>
          <p className="text-base font-semibold">{periodLabel}</p>
        </div>
        <PeriodFilter year={year} month={month} currentYear={currentYear} currentMonth={currentMonth} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TrendingUp className="size-4 text-[#04B1AF]" />
            Promedio de entrada
          </div>
          <p className="mt-2 text-2xl font-bold">{averageArrivalLabel ?? "Sin datos"}</p>
          {averageArrivalDeltaLabel && (
            <p className="mt-1 text-sm text-muted-foreground">{averageArrivalDeltaLabel}</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <CalendarClock className="size-4 text-[#04B1AF]" />
            Días trabajados
          </div>
          <p className="mt-2 text-2xl font-bold">{summary.diasTrabajados}</p>
          <p className="mt-1 text-sm text-muted-foreground">{diasTrabajadosLabel}</p>
        </div>

        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Users className="size-4 text-[#04B1AF]" />
            Puntualidad
          </div>
          <p className="mt-2 text-2xl font-bold">{puntualidadLabel}</p>
        </div>

        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Clock3 className="size-4 text-[#04B1AF]" />
            Horas trabajadas
          </div>
          <p className="mt-2 text-2xl font-bold">{horasTrabajadasLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4 text-muted-foreground" />
            Registro de asistencia
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay días programados en este período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.dateIso}>
                    <TableCell>{row.dateLabel}</TableCell>
                    <TableCell>{row.arrivalLabel ?? "—"}</TableCell>
                    <TableCell>{row.exitLabel ?? "—"}</TableCell>
                    <TableCell>{row.workedLabel ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={ESTADO_BADGE_CLASSNAMES[row.estado]}>{row.estadoLabel}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.observacion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border p-5">
            <p className="mb-3 text-sm font-semibold">Resumen del período</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Días trabajados</dt>
                <dd className="font-medium">{summary.diasTrabajados}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Puntuales</dt>
                <dd className="font-medium">{summary.puntuales}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Llegadas tarde</dt>
                <dd className="font-medium">{summary.llegadasTarde}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Salidas anticipadas</dt>
                <dd className="font-medium">{summary.salidasAnticipadas}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ausencias</dt>
                <dd className="font-medium">{summary.ausencias}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Permisos</dt>
                <dd className="font-medium">{summary.permisos}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Feriados</dt>
                <dd className="font-medium">{summary.feriados}</dd>
              </div>
            </dl>
            <div className="mt-3 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Horas trabajadas</dt>
                <dd className="font-medium">{summary.horasTrabajadasLabel}</dd>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Promedio diario: {summary.promedioDiarioLabel}</p>
            </div>
          </div>

          {motivationalPhrase && (
            <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-4 text-sm">
              {motivationalPhrase}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{scheduleFooterNote}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: errors ARE expected at this point - `src/app/(app)/ponchador/page.tsx` still imports `PonchadorDashboard` with the OLD two-prop signature (`averageArrivalLabel`/`rows` only), which no longer satisfies this component's new required props. This is fine - Task 4 fixes `page.tsx` to match. Confirm the errors are specifically about `page.tsx`'s call to `<PonchadorDashboard>` missing props, not about `PonchadorDashboard.tsx` itself having a syntax/type error internal to the file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorDashboard.tsx"
git commit -m "feat: rewrite PonchadorDashboard with the period-based layout"
```

---

## Task 4: `page.tsx` — data fetching and wiring

**Files:**
- Modify: `src/app/(app)/ponchador/page.tsx`

This is the final integration task. It requires Tasks 1-3 to already be done.

The current full content of `src/app/(app)/ponchador/page.tsx` is:

```tsx
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

  // Scoped by the time_clock_punches_select_own RLS policy (contact_id-based),
  // not by employee_no_string like the home page's admin-client reads do -
  // see "Data Access" in docs/superpowers/specs/2026-08-12-ponchador-module-design.md.
  // The two agree in steady state; they could diverge only in edge cases like
  // an employee number being reassigned after ingestion.
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
```

- [ ] **Step 1: Replace the whole file**

Replace the entire content of `src/app/(app)/ponchador/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors (this resolves the expected errors flagged at the end of Task 3).

Run: `bun run test`
Expected: all tests pass (aside from any pre-existing, unrelated Supabase-auth rate-limit flakiness - if a failure's message is exactly "Request rate limit reached" in a file this plan didn't touch, it's not a regression; re-run to confirm).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/page.tsx"
git commit -m "feat: wire the period dashboard's data fetching into page.tsx"
```

---

## Self-Review Notes

- **Spec coverage:** Period filter (Año/Mes, disabled Semana, período readout) → Task 2 + Task 4's `year`/`month`/`currentYear`/`currentMonth` computation. 4 stat cards → Task 3's grid + Task 4's `averageArrivalLabel`/`diasTrabajadosLabel`/`puntualidadLabel`/`horasTrabajadasLabel`. Estado/Observación table enumerating scheduled workdays (not just punched days) → Task 1's `buildAttendancePeriodRows` + Task 4's period-row mapping. Permiso via `vacation_requests` (own requests only) → Task 4's explicit `requester_app_user_id` filter. Resumen panel → Task 3's `dl` block, fed by the same `summary` object the cards already use - no new logic, as the spec requires. Motivational phrase reusing the existing pool → Task 4's `attachScheduleComparison`/`averageMinutesEarly`/`classifyArrivalTier`/`pickMotivationalPhrase` calls (all pre-existing, unchanged). Footer schedule note → Task 4's `scheduleFooterNote` via the pre-existing `formatScheduleLine`. Feriados fixed at 0 → `summarizeAttendancePeriod`'s hardcoded `feriados: 0`. "Known limitation" (past months before punch history existed showing all-Ausente) → not code, already documented in the spec; no task needed.
- **Placeholder scan:** none found - every step has complete, concrete code.
- **Type consistency:** `PonchadorRow["estado"]`/`DayEstado` use the identical five string literals everywhere (attendance.ts, PonchadorDashboard.tsx, page.tsx's `ESTADO_LABELS`/`ESTADO_BADGE_CLASSNAMES` records) - a `Record<PonchadorRow["estado"], ...>` type would fail to compile if any were missing, so a typo here surfaces as a Task 3/4 type error, not a silent runtime gap. `ApprovedLeaveRange{dateFrom,dateTo}` (Task 1) matches exactly what Task 4 builds from the `vacation_requests` query (`date_from`→`dateFrom`, `date_to`→`dateTo`). `PonchadorSummary` (Task 3) and the object Task 4 builds for it list every field in the same order with matching names.
- **Known, intentional test-suite disruption:** Task 3's `bunx tsc --noEmit` step explicitly expects errors (page.tsx not yet updated) - this is called out so whoever executes this doesn't mistake it for a regression and doesn't attempt to "fix" Task 3 by prematurely touching `page.tsx`.
