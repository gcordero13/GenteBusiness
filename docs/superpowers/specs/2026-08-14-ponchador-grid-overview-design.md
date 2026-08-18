# Ponchador "Vista General" Grid Redesign — Design

## Context

The just-shipped "Vista general" tab shows a roster with one summary row per person (name + 4 aggregate stats), grouped into separate tables per department when viewing the whole company. This redesign replaces that table entirely — in both "Mi Equipo" and "Todos" — with a single continuous grid: two rows per person (Entrada/Salida), one column per calendar day of the selected month, and a trailing puntualidad percentage column. Approved leave days are color-coded, distinguishing vacation from personal permission for the first time in this codebase.

## Data Model Change: `vacation_requests.tipo`

Today `vacation_requests` has no field distinguishing a vacation request from a personal-permission request — every approved request renders identically as "Permiso" everywhere in the app. This redesign needs that distinction to color the grid correctly, so:

- New column: `vacation_requests.tipo text not null default 'vacaciones' check (tipo in ('vacaciones', 'permiso'))`. Defaulting existing and future unset rows to `'vacaciones'` preserves today's behavior for every already-approved request (the feature was originally built exclusively for vacation time).
- `NewVacationRequestDialog.tsx` (the "Nueva solicitud" form) gains a required "Tipo" selector (Vacaciones / Permiso) so new requests can be explicitly classified going forward. This is the only change to the "Solicitudes: Vacaciones" feature — the approval flow (supervisor/RRHH screens), RLS, and status transitions are untouched.
- The already-shipped `/ponchador` single-person dashboard's Estado classification (Puntual/Llegada tarde/Salida anticipada/Ausente/Permiso) is **not** changed by this work — it keeps treating any approved request as "Permiso" undifferentiated. Only the new roster grid distinguishes vacaciones/permiso; scoping the distinction to just the new view keeps this a narrow, additive change rather than one that ripples into the already-tested individual view.

## Table Layout

One continuous table (no per-department sub-tables — "Todos"'s department filter narrows which people's rows appear, but never splits the table itself):

| Nombre | | Día 1 | Día 2 | … | Día N | % |
|---|---|---|---|---|---|---|
| Juan Pérez | E | 8:05 | — | … | 8:12 | 91% |
| | S | 17:02 | — | … | 17:15 | |

- Each person occupies exactly two rows: "E" (Entrada) shows that day's arrival time, "S" (Salida) shows that day's exit time.
- Day columns run from 1 to the last calendar day of the selected month (28–31, including weekends) — this is a period-wide grid, not filtered down to scheduled workdays only.
- The puntualidad percentage is shown once per person (on the "E" row), computed by the exact same, already-shipped `buildAttendancePeriodRows` → `summarizeAttendancePeriod` → `classifyPuntualidadLabel` pipeline the single-person dashboard already uses — no new percentage logic.
- The table scrolls horizontally in its own container (up to ~31 day columns is wide) — the page itself never scrolls sideways, matching this codebase's existing wide-table convention.

## Per-Day Cell Coloring

Each day's Entrada/Salida cell pair gets one of five treatments:

1. **Vacaciones** (day falls inside an approved `tipo = 'vacaciones'` request) → blue.
2. **Permiso** (day falls inside an approved `tipo = 'permiso'` request) → orange.
3. **Ausente** (a scheduled workday, on or before today, with no punch and no approved leave) → red.
4. **Weekend / non-scheduled day** → neutral, no highlight — deliberately distinct from "ausente" so a Saturday doesn't visually read as an unexcused absence.
5. **Normal** (punched, or a future day not yet reached) → no highlight; the day's actual times are shown when present.

## New Pure Function: `buildAttendanceGridDays`

A new function in `src/lib/attendance.ts`, additive — it does not modify `buildDailyAttendanceRows`, `buildAttendancePeriodRows`, `DayEstado`, or any other existing export.

```typescript
export type GridDayStatus = "vacaciones" | "permiso" | "ausente" | "weekend" | "normal";

export interface AttendanceGridDay {
  dateIso: string;
  dayNumber: number;
  arrivalLabel: string | null;
  exitLabel: string | null;
  status: GridDayStatus;
}

export function buildAttendanceGridDays(
  periodStartIso: string,
  periodEndIso: string, // the full calendar month, unclamped
  todayIso: string, // absence detection only applies on/before this date
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  vacacionesRanges: ApprovedLeaveRange[],
  permisoRanges: ApprovedLeaveRange[],
): AttendanceGridDay[]
```

For each calendar day in the period: resolve arrival/exit labels from `arrivalsAndExits` (via the same `formatArrivalTime` used elsewhere) independently of `status` — a weekend day with an actual punch on it (e.g. approved overtime) still shows its real times, just with the neutral weekend cell treatment rather than a highlight. Classify `status` in priority order — vacaciones, then permiso, then (if it's a scheduled workday, on/before `todayIso`, with no arrival) ausente, then (if not a scheduled workday) weekend, else normal.

## Data Fetching Changes

- The two existing batch approved-leave functions, `get_ponchador_team_approved_leave` and `get_ponchador_all_approved_leave`, gain a `tipo text` column in their `RETURNS TABLE(...)` — the same Postgres drop-then-recreate requirement applies as the last time a `RETURNS TABLE` shape changed on this feature (Postgres rejects `CREATE OR REPLACE FUNCTION` for a changed return shape).
- `page.tsx`'s overview branch splits each person's batch leave rows into two lists by `tipo` before calling `buildAttendanceGridDays`.
- `PonchadorOverviewTable.tsx` is rewritten (not extended) to render the new grid shape; its old `groupByDepartment`/multi-table-per-department rendering and its old 4-stat-per-row shape are removed entirely, since the redesign replaces rather than layers onto the previous table.

## Testing

- New `buildAttendanceGridDays` unit tests in `attendance.test.ts`: a vacaciones day, a permiso day, an ausente day, a weekend day, a normal punched day, a future day within the same month (not marked ausente even with no punch), and priority ordering when a day is (implausibly) covered by both a vacaciones and a permiso range.
- Existing `ponchadorVisibility.test.ts` gains assertions that the two extended batch functions return the correct `tipo` per row.
- `Solicitudes: Vacaciones` gets a small test confirming a new request defaults to `tipo = 'vacaciones'` when the form's value is omitted, and correctly stores `'permiso'` when selected.

## Out of Scope

- Changing the single-person `/ponchador` dashboard's Estado classification to distinguish vacaciones/permiso (stays merged as "Permiso").
- Retroactively reclassifying any already-approved request's `tipo` (all default to `'vacaciones'`).
- Editing a request's `tipo` after submission.
- Any change to the RRHH/supervisor approval screens beyond what's needed to store the new field.
