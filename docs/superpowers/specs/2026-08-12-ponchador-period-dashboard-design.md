# Ponchador Period Dashboard (Phase 1) — Design

## Context

This is Phase 1 of a larger "Mi Asistencia"-style redesign of `/ponchador`, requested from a reference mockup. The full mockup (period type toggle, 4 summary cards, an Estado/Observación table, a Resumen panel, a motivational box, an export button, a footer schedule note) was explicitly too large for one pass - this phase covers everything except week-view (deferred) and export (deferred). Our own app's existing sidebar/navigation is untouched; only the `/ponchador` page's own content area changes.

The current `/ponchador` (already shipped, `docs/superpowers/specs/2026-08-12-ponchador-module-design.md`) shows exactly one stat ("Promedio de llegada este mes") and a 3-column table (Fecha/Entrada/Salida) for the current calendar month only, with no month navigation and no concept of absence, early departure, or leave requests. This phase replaces that dashboard's content with the richer one below, reusing everything from `src/lib/attendance.ts` and the named-schedule system that already exists.

## Summary

- A **period filter** (Año + Mes dropdowns, a disabled "Semana" toggle labeled "Próximamente", a "Período seleccionado" readout) that navigates via URL query params (`/ponchador?year=2026&month=8`) - no client-side data fetching, the Server Component just reads `searchParams`.
- **Four stat cards**: Promedio de entrada (+ early/late badge vs. schedule), Días trabajados (of how many días hábiles), Puntualidad % (+ qualitative label), Horas trabajadas (total).
- A **Registro de asistencia** table that now enumerates every *scheduled workday* in the period (not just days with a punch), each classified into exactly one Estado: Permiso, Ausente, Llegada tarde, Salida anticipada, or Puntual, with a short Observación.
- A **Resumen del período** panel - a restatement of the same counts the cards and table already computed, no new logic.
- The existing **motivational phrase** (same 12-phrase pool, same tier logic), shown as a small box.
- A **footer note** stating the effective schedule's start time and tolerance.

**Explicitly deferred to later phases:** week-view, the "Exportar" button, and a real "Feriados" (company holidays) concept - this codebase has no holiday calendar anywhere, so that category is shown fixed at `0` as a placeholder.

**Known limitation, not a bug:** navigating to a month before the Hikvision punch pipeline started collecting data (or before a contact's `hikvision_employee_no` was configured) will show every scheduled workday in that month as "Ausente," since there's no punch history to find. This is a data-completeness fact, not a classification error.

## Data Sources

- **Scheduled workdays**: the viewer's effective schedule (`getEffectiveSchedule`, already used elsewhere) tells us which days of the week they work and at what hours/tolerance.
- **Arrivals/exits**: `buildDailyAttendanceRows` (already built), fed by a wide `time_clock_punches` fetch via the existing session client (RLS-scoped to the viewer's own rows via `time_clock_punches_select_own`, from the already-shipped Ponchador migration).
- **Permiso**: `vacation_requests` where `status = 'aprobado'` and the request's `[date_from, date_to]` range overlaps the day. `vacation_requests_select`'s existing RLS policy already allows `requester_app_user_id = auth.uid()` - the viewer's own approved requests are readable with the normal session client, no new policy needed.
- **Today cutoff**: absence detection only runs for days up to `getBusinessToday()` - a scheduled day later in the same month that hasn't happened yet is not shown as "Ausente" (it's simply not enumerated past today).

## `src/lib/attendance.ts` — new pure functions

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

// Builds one row per scheduled workday between periodStartIso and
// periodEndIso (inclusive) - the caller is responsible for clamping
// periodEndIso to getBusinessToday() so future days aren't evaluated for
// absence. Non-workdays for this schedule are not included in the result at
// all. For each scheduled day, in priority order:
//   1. Covered by an approved leave range -> "permiso"
//   2. No punch that day at all -> "ausente", observación "Sin justificación"
//   3. Arrival later than schedule start + tolerance_minutes -> "llegada_tarde",
//      observación "{N} min tarde"
//   4. Exit earlier than schedule end - earlyDepartureThresholdMinutes ->
//      "salida_anticipada", observación "{N} min antes" (a day can only be
//      "salida_anticipada" if it wasn't already "llegada_tarde" - arrival
//      problems take priority over departure ones)
//   5. Otherwise -> "puntual", observación "—"
export function buildAttendancePeriodRows(
  periodStartIso: string,
  periodEndIso: string,
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  approvedLeave: ApprovedLeaveRange[],
  earlyDepartureThresholdMinutes: number,
): AttendancePeriodRow[];

export interface AttendancePeriodSummary {
  diasHabiles: number;
  diasTrabajados: number; // puntual + llegada_tarde + salida_anticipada
  puntuales: number;
  llegadasTarde: number;
  salidasAnticipadas: number;
  ausencias: number;
  permisos: number;
  feriados: number; // always 0 - no holiday calendar exists yet
  horasTrabajadasMinutes: number; // sum of workedMinutes across all rows that have it
  promedioEntradaMinutes: number | null; // average arrivalMinutes across días trabajados, null if none
  puntualidadPercent: number | null; // round(puntuales / diasTrabajados * 100), null if diasTrabajados is 0
}

// Pure aggregation over buildAttendancePeriodRows' own output - no new data
// source, just counting/summing what's already there.
export function summarizeAttendancePeriod(rows: AttendancePeriodRow[]): AttendancePeriodSummary;

// Qualitative label shown next to the Puntualidad % stat card. null input
// (no días trabajados yet this period) renders no badge at all.
export function classifyPuntualidadLabel(puntualidadPercent: number | null): "Excelente" | "Buena" | "A mejorar" | null {
  if (puntualidadPercent === null) return null;
  if (puntualidadPercent >= 95) return "Excelente";
  if (puntualidadPercent >= 85) return "Buena";
  return "A mejorar";
}
```

`earlyDepartureThresholdMinutes` is a flat constant (proposed: 15 minutes) rather than a new per-schedule column - there's no existing "departure tolerance" concept to reuse, and adding one to `schedule_templates` is more schema than this phase needs. If this threshold ever needs to be configurable per schedule, that's a natural follow-up, not part of this phase.

## `src/app/(app)/ponchador/page.tsx` — data fetching changes

1. Read `searchParams.year`/`searchParams.month`; default both to `getBusinessToday()`'s current year/month if absent or invalid.
2. Compute `periodStartIso` (the 1st of that month) and `periodEndIso` (the last day of that month, clamped to `todayIso` if the selected month is the current month - a future month can't be selected at all, since the year/month dropdowns only offer up to the current month).
3. Fetch `time_clock_punches` for a window covering the selected period (same wide-fetch-then-filter approach already used).
4. Fetch `vacation_requests` where `status = 'aprobado'` and `date_from <= periodEndIso and date_to >= periodStartIso` (the standard range-overlap condition), for the viewer only (RLS already scopes this).
5. `buildAttendancePeriodRows(...)` → `summarizeAttendancePeriod(...)`.
6. Motivational phrase: same as the already-shipped home-page card, using this period's `puntualidadPercent`-driven tier instead of the raw minutes-early average - re-expressed via `classifyArrivalTier`'s existing tolerance-based logic applied to the period's average arrival vs. schedule (already computable from the existing `attachScheduleComparison`/`averageMinutesEarly` functions over the same `arrivalsAndExits` data - no new tier logic needed here, just reusing it for this page too).

## UI

**New client component** `src/app/(app)/ponchador/PeriodFilter.tsx`: Año dropdown (a small fixed range - e.g. the last 3 years through the current year, since punch history doesn't go back further), Mes dropdown (Enero–Diciembre, disabled for months after the current one), a disabled "Semana" button, and a "Período seleccionado: 01 {Mes} - {último día} {Mes}" readout. Selecting either dropdown navigates via `router.push` to the new `?year=&month=` URL - no client-side fetching.

**`PonchadorDashboard.tsx`** grows from one stat card to the full layout: 4 stat cards in a row, the table (now with Estado as a colored badge - reusing this codebase's existing `Badge` component with its `variant` prop, and Observación as plain text), a "Resumen del período" side panel (counts + horas trabajadas + daily average), the motivational phrase box, and a footer line with the effective schedule's start time and `tolerance_minutes`. Exact Tailwind/badge-variant choices are left to the implementation plan, following this component's own already-established visual language (rounded-2xl cards, `#04B1AF` accent) rather than copying the reference mockup's colors literally.

## Testing

Unit tests for `buildAttendancePeriodRows`: a scheduled day with an approved leave range covering it (permiso, even if it also happens to have no punch), a scheduled day with zero punches and no leave (ausente), a scheduled day with a late arrival (llegada_tarde, with the exact minute count in the observación), a scheduled day with an on-time arrival but an early exit (salida_anticipada), a scheduled day with both a late arrival and an early exit (llegada_tarde wins, per the stated priority), a fully on-time day (puntual), a non-workday for this schedule (excluded from the result entirely), and a period where `periodEndIso` is before `periodStartIso` (empty result).

Unit tests for `summarizeAttendancePeriod`: correct counts for a mixed set of rows covering all five Estado values, `puntualidadPercent` and `horasTrabajadasMinutes`/`promedioEntradaMinutes` returning `null` appropriately when there are zero `diasTrabajados` rows (e.g. an entirely-permiso or entirely-ausente period), and `feriados` always `0`.

Unit tests for `classifyPuntualidadLabel`: the boundary values themselves (94→"A mejorar", 95→"Excelente", 84→"A mejorar", 85→"Buena") and `null` in → `null` out.

No new integration test needed for the `vacation_requests` read - `vacation_requests_select`'s RLS is already covered by existing tests, and this phase only adds a new *query shape* (a date-range filter), not new access.

## Out of Scope

- Week-view period selection (deferred to its own future phase - reuses this phase's functions, just with a different date range).
- The "Exportar" button (CSV/PDF - deferred, no format decided yet).
- A real company-holidays ("Feriados") calendar - shown fixed at 0.
- A manually-entered reason/justification field for "Salida anticipada" or "Ausente" (the reference mockup's example reasons like "Salida por cita médica" are illustrative, not something this phase can derive automatically).
- Making `earlyDepartureThresholdMinutes` configurable per schedule (a flat constant for now).
