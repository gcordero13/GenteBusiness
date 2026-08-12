# Ponchador Module (Personal Attendance Log) — Design

## Context

This is the "Bitácora" sub-project from the original attendance-analytics decomposition (see `docs/superpowers/specs/2026-08-11-attendance-summary-cards-design.md`'s "Out of Scope" section, which explicitly deferred "a historical/browsable Bitácora view"). That home-page feature already ships a viewer's current-month average arrival, today's arrival, and a company-wide Top 5 - all read-only glances. This spec adds a dedicated page, `/ponchador`, where a viewer can see their own current month's day-by-day entrada/salida log alongside that same average-arrival figure, gated behind a new role-profile permission (unlike the home-page cards, which are gated only by having a `hikvision_employee_no`).

This builds directly on `src/lib/attendance.ts` (the pure-function library from the just-shipped attendance-summary-cards feature) and its `getBusinessToday()`/timezone conventions. No changes to the Hikvision punch-ingestion pipeline or the schedules system.

## Summary

A new page, `/ponchador`, visible in the sidebar only to role profiles with the new `ponchador` module's `can_view` permission. Shows:

1. A summary card with the viewer's average arrival time for the current calendar month (identical calculation to the home page's "Mi promedio" card).
2. A table, one row per day in the current month that has at least one punch, showing that day's **Entrada** (first punch before noon) and **Salida** (last punch of the day, when distinct from the entrada).

Current month only - no month-to-month navigation in this version. If the viewer has the `ponchador` permission but no `hikvision_employee_no`, the page shows "No tienes código de ponchador asignado" instead of an empty table.

## Data Access

**New RLS policy, not the admin client.** Unlike the home page's Top 5 (deliberately company-wide, which is why that feature uses `createAdminClient()`), this page is 100% personal - "mi registro," nothing more. `time_clock_punches` currently has zero SELECT policies at all. Rather than reuse the admin client here too, this feature adds a real RLS policy scoped to exactly one thing: a row is visible if its `contact_id` matches the viewer's own contact. This is safe (no user can ever see another user's rows through it) and is the more correct long-term shape for "read my own data" access - it doesn't touch or loosen anything the home page's Top 5 relies on.

The shape this policy takes:

```sql
create policy "time_clock_punches_select_own" on public.time_clock_punches
for select using (
  contact_id in (
    select id from public.contacts
    where email = (select email from public.app_users where id = auth.uid())
  )
);
```

(Illustrative - the exact migration file is written during implementation, following this codebase's established pattern of an additive migration with an explicit STOP for the human to paste it into Supabase before the code that depends on it ships.)

**Permission check happens in the page itself, not via RLS.** The RLS policy above grants any authenticated user read access to their *own* punches unconditionally - it has no idea about the `ponchador` module permission. So `/ponchador`'s page component explicitly checks `get_my_module_permissions('ponchador').can_view` and redirects to `/` if false, the same pattern already used by `attendance-devices/page.tsx`'s `can_manage` check. This is the one place in this feature where the module-permission system and RLS aren't the same gate - worth remembering if this page's data access is ever revisited.

## Permission Module

A new module, `ponchador`, registered the same way `solicitudes_vacaciones` was: one `can_view` flag, defaulted to `false` for every existing role profile except Super Admin (`true`). An admin turns it on for whichever profiles should see this page, from the existing "Perfiles de rol" admin screen - no new admin UI needed, that screen already lists every registered module.

```sql
insert into public.modules (key, label) values ('ponchador', 'Ponchador');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, (rp.name = 'Super Admin'), false, false, false, false, false, false
from public.role_profiles rp
cross join public.modules m
where m.key = 'ponchador';
```

(Illustrative, same note as above.)

## `src/lib/attendance.ts` — new pure function, and a refactor of an existing one

**New function**, the shared primitive behind both the daily table and (via a small refactor) the existing arrival-only view:

```typescript
export interface DailyAttendanceRow {
  dateIso: string; // "YYYY-MM-DD", business-timezone calendar day
  arrivalMinutes: number | null; // earliest punch before noon that day, or null
  exitMinutes: number | null; // latest punch that day, or null - see rule below
}

// For each business-timezone calendar day that has at least one punch:
// - arrivalMinutes is the earliest punch before noon that day, or null if
//   every punch that day was at/after noon (the same "not a real morning
//   arrival" rule deriveDailyArrivals already applies).
// - exitMinutes is the day's latest punch - UNLESS that day has exactly one
//   punch and it's already the arrival (a single morning punch isn't shown
//   as both an entrada and a salida - there's no second event to report).
//   A day whose only punch is in the afternoon has no arrival, so that one
//   punch is reported as exitMinutes instead - there's no arrival for it to
//   collide with.
export function buildDailyAttendanceRows(punchedAtIsoTimestamps: string[]): DailyAttendanceRow[];
```

**Refactor** (behavior-preserving - the existing 45 unit tests must pass unchanged): `deriveDailyArrivals` becomes a thin filter over `buildDailyAttendanceRows`, instead of duplicating the "earliest punch before noon" logic a second time:

```typescript
export function deriveDailyArrivals(punchedAtIsoTimestamps: string[]): DailyArrival[] {
  return buildDailyAttendanceRows(punchedAtIsoTimestamps)
    .filter((row): row is DailyAttendanceRow & { arrivalMinutes: number } => row.arrivalMinutes !== null)
    .map((row) => ({ dateIso: row.dateIso, arrivalMinutes: row.arrivalMinutes }));
}
```

No other existing function changes. The already-shipped `formatArrivalTime` is reused as-is for formatting both `arrivalMinutes` and `exitMinutes` in the UI - it's already generic ("minutes since midnight" → "8:12 am"), nothing about it is arrival-specific.

## Data Fetching — `src/app/(app)/ponchador/page.tsx`

1. `get_my_module_permissions('ponchador')` - if `can_view` is false, `redirect("/")`.
2. Fetch the viewer's own `contacts` row (`hikvision_employee_no`, `first_name` - `first_name` isn't needed here, only `hikvision_employee_no`). If null, render the "sin código de ponchador" empty state and stop.
3. Fetch `time_clock_punches` for the viewer via the **normal session-scoped client** (`createClient()`, not admin): `select punched_at from time_clock_punches where punched_at >= <window start>`. No `employee_no_string`/`contact_id` filter is needed in the query at all - the new RLS policy already restricts the result set to the viewer's own rows, so whatever comes back is theirs by construction. This also sidesteps the exact kind of data-hygiene bug already found once this session (a stray space in a contact's `hikvision_employee_no` silently breaking an `employee_no_string` string match) - matching here happens through `contact_id`, set correctly at ingestion time, not through that string. Same ~40-day wide window, filtered precisely to the current month in application code, as the home page's Card 1/2 already do (`src/app/(app)/page.tsx`'s `windowStartIso`) - not a new convention.
4. `buildDailyAttendanceRows(...)` → filter to `dateIso >= monthStartIso` → sort ascending by `dateIso` for the table.
5. `averageArrivalMinutes(deriveDailyArrivals(...))` on the same monthly window, exactly like the home page's Card 1 (minus the motivational phrase - this page doesn't repeat that).

## UI

New component `src/app/(app)/ponchador/PonchadorDashboard.tsx` (presentational, no data fetching):

```typescript
export interface PonchadorRow {
  dateIso: string;
  dateLabel: string; // "11 de agosto" via the existing formatMonthDay()
  arrivalLabel: string | null; // formatted time, or null -> renders "—"
  exitLabel: string | null;
}

export function PonchadorDashboard({
  averageArrivalLabel,
  rows,
}: {
  averageArrivalLabel: string | null;
  rows: PonchadorRow[];
}) { /* ... */ }
```

Layout: a single summary card at the top (icon + "Promedio de llegada este mes" + the formatted value, or "Sin datos este mes" - visually consistent with the home page's "Mi promedio" card), followed by a table below it (using the existing `Table`/`TableHeader`/`TableRow`/`TableCell` components already used by `solicitudes/vacaciones/page.tsx` and others) with columns **Fecha / Entrada / Salida**. A missing entrada or salida renders as "—", not a blank cell. An empty table (no punches at all yet this month) shows "Aún no hay ponchadas registradas este mes" instead of a header-only table.

Sidebar: a new conditional entry in `mainLinks` (`src/app/(app)/Sidebar.tsx`), next to "Mi perfil", gated on a new `canViewPonchador` prop threaded from the layout the same way every other sidebar flag already is. Icon: `CalendarClock` (already used elsewhere in this codebase, e.g. `ContactViewDialog.tsx`) - distinct from the existing admin "Ponchadores" (device management) sidebar entry, which keeps its own `Fingerprint` icon, so the two aren't visually confused with each other.

## Testing

- Unit tests for `buildDailyAttendanceRows`: a day with only a morning punch (arrival set, exit null), a day with morning + afternoon punches (both set), a day with only an afternoon punch (arrival null, exit set to that punch), a day with two afternoon punches and no morning one (arrival null, exit = the later of the two), multiple days sorted ascending, empty input.
- A test confirming `deriveDailyArrivals`'s existing behavior is unchanged after the refactor (the existing 6 tests for it continue to pass verbatim).
- Integration test: the new `time_clock_punches_select_own` RLS policy - a user can SELECT their own contact's punches; the same user gets zero rows when querying (or cannot see) another contact's punches.
- No test needed for the `ponchador` module registration itself - `role_profiles`/`role_profile_permissions` RLS is already covered by existing tests (`roleProfiles.test.ts`), and this is just a new row in an already-tested table.

## Out of Scope

- Month-to-month navigation or any history beyond the current calendar month.
- Average salida, total hours worked, or on-time/late day counts - the user explicitly scoped this version to average arrival only; any of these could be added later as their own small extension.
- Refactoring the home page's Card 1/2 to use this new RLS policy instead of the admin client - they work correctly as shipped, and touching already-working, already-reviewed code isn't necessary just because a narrower access path now exists for a different page.
- Any change to how punches are ingested or how schedules resolve.
