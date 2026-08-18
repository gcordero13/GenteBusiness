# Ponchador "Vista General" Grid Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Vista general" roster table (name + 4 aggregate stats, grouped into per-department sub-tables) with a single continuous grid — two rows per person (Entrada/Salida), one column per calendar day of the month, a trailing puntualidad percentage, and color-coded cells for vacaciones/permiso/ausente — in both "Mi Equipo" and "Todos".

**Architecture:** A new `tipo` column on `vacation_requests` ('vacaciones' | 'permiso') finally distinguishes the two leave categories the roster needs to color differently — the already-shipped single-person dashboard's Estado classification is untouched and keeps merging both into "Permiso". A new pure function, `buildAttendanceGridDays`, enumerates every calendar day of the month (unlike the existing workday-only `buildAttendancePeriodRows`) and classifies each day's color status; the roster's puntualidad percentage keeps using the existing, unchanged summary pipeline.

**Tech Stack:** Next.js 16 Server Components, Supabase Postgres (`security definer` functions), TypeScript, Vitest, existing shadcn `Table`/`Select` primitives.

**Spec:** `docs/superpowers/specs/2026-08-14-ponchador-grid-overview-design.md`.

---

## File Structure

- **Create** `supabase/migrations/20260815100000_vacation_requests_tipo_and_grid_leave.sql` — adds `vacation_requests.tipo`, and extends `get_ponchador_team_approved_leave`/`get_ponchador_all_approved_leave` to return it.
- **Modify** `src/test/integration/ponchadorVisibility.test.ts` — extends the `insertApprovedVacationRequest` helper with a `tipo` parameter, adds assertions that the two batch functions return `tipo` correctly.
- **Modify** `src/lib/attendance.ts` / `src/lib/attendance.test.ts` — new `buildAttendanceGridDays` function, TDD.
- **Modify** `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx` / `actions.ts` / `actions.test.ts` — add the "Tipo" field to the request form.
- **Modify** `src/app/(app)/ponchador/PonchadorOverviewTable.tsx` — full rewrite: grid layout instead of the per-department summary table.
- **Modify** `src/app/(app)/ponchador/page.tsx` — rewires the "overview" branch to build grid rows instead of summary rows.
- **Untouched**: `PonchadorDashboard.tsx`, `PeriodFilter.tsx`, `PonchadorPersonSelector.tsx`, `PonchadorScopeTabs.tsx`, `PonchadorDepartmentFilter.tsx`, `PonchadorRosterScopeToggle.tsx`, `get_ponchador_punches`/`get_ponchador_approved_leave`/`get_ponchador_contact_summary` (single-person functions), `buildAttendancePeriodRows`/`DayEstado` — the single-person dashboard and the tab/filter controls are unaffected by this redesign.

---

## Task 1: Migration — `vacation_requests.tipo` + extend the two batch leave functions

**Files:**
- Create: `supabase/migrations/20260815100000_vacation_requests_tipo_and_grid_leave.sql`

**Postgres gotcha (same one hit twice already this session):** `get_ponchador_team_approved_leave`/`get_ponchador_all_approved_leave` are gaining a new `RETURNS TABLE(...)` column (`tipo`). Postgres does not allow `CREATE OR REPLACE FUNCTION` to change a function's return shape — both must be dropped (with their exact existing parameter types, `date, date`) before being recreated with a plain `create function`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260815100000_vacation_requests_tipo_and_grid_leave.sql`:

```sql
-- Distinguishes a vacation request from a personal-permission request - both
-- have rendered identically as "Permiso" everywhere in the app until now.
-- Defaulting to 'vacaciones' preserves today's behavior for every
-- already-approved request (this feature was originally built exclusively
-- for vacation time) and for any future insert that doesn't set it
-- explicitly.
alter table public.vacation_requests
  add column tipo text not null default 'vacaciones' check (tipo in ('vacaciones', 'permiso'));

-- Return shape is changing (new tipo column) - must drop before recreating,
-- see migration header comment.
drop function if exists public.get_ponchador_team_approved_leave(date, date);
drop function if exists public.get_ponchador_all_approved_leave(date, date);

-- Batch approved leave for the caller's downward reports_to_id chain, now
-- including tipo so the Vista general grid can color vacaciones/permiso
-- days differently.
create function public.get_ponchador_team_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date, tipo text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_contact_id uuid;
begin
  select c.id into my_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  if my_contact_id is null then
    return;
  end if;

  return query
    select vr.contact_id, vr.date_from, vr.date_to, vr.tipo
    from public.vacation_requests vr
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = vr.contact_id
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;

-- Batch approved leave company-wide, same tipo addition, same can_manage
-- gating as before.
create function public.get_ponchador_all_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date, tipo text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  can_manage_all boolean;
begin
  select coalesce((select can_manage from public.get_my_module_permissions('ponchador')), false)
  into can_manage_all;

  if not can_manage_all then
    return;
  end if;

  return query
    select vr.contact_id, vr.date_from, vr.date_to, vr.tipo
    from public.vacation_requests vr
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;
```

- [ ] **Step 2: STOP — human applies the migration**

Do NOT paste this SQL into Supabase yourself. Tell the human the migration is ready at `supabase/migrations/20260815100000_vacation_requests_tipo_and_grid_leave.sql` and wait for them to paste it into the Supabase SQL Editor and confirm it ran successfully. **Do not proceed to Task 2 until they explicitly confirm.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260815100000_vacation_requests_tipo_and_grid_leave.sql
git commit -m "feat: add vacation_requests.tipo and thread it through the Ponchador batch leave functions"
```

---

## Task 2: Integration tests for `tipo`

**Files:**
- Modify: `src/test/integration/ponchadorVisibility.test.ts`

Depends on Task 1's migration being applied (confirmed by the human).

- [ ] **Step 1: Extend the `insertApprovedVacationRequest` helper**

Read the current helper in `src/test/integration/ponchadorVisibility.test.ts` first. Add an optional `tipo` parameter (default `"vacaciones"`, matching the DB column default) that gets included in the initial insert:

```typescript
async function insertApprovedVacationRequest(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    contactId: string;
    requesterAppUserId: string;
    firstName: string;
    lastName: string;
    tipo?: "vacaciones" | "permiso";
  },
) {
  // ... existing insert, adding `tipo: params.tipo ?? "vacaciones"` to the initial insert payload ...
}
```

(Match this to the helper's actual current parameter shape — the point is: add one optional `tipo` field, default it to `"vacaciones"`, pass it through on the insert step only, since the trigger-driven update steps don't touch `tipo`.)

- [ ] **Step 2: Add the new test cases**

Add these `it` blocks to the existing `describe("Ponchador team/company visibility", ...)` block:

```typescript
it("get_ponchador_team_approved_leave returns each request's tipo", async () => {
  viewer = await createTestUser("Viewer");
  const admin = createAdminClient();

  const { data: ownContact } = await admin
    .from("contacts")
    .insert({ first_name: "Lead", last_name: "Self", email: viewer.email })
    .select()
    .single();
  contactIds.push(ownContact!.id);

  const { data: report } = await admin
    .from("contacts")
    .insert({ first_name: "Direct", last_name: "Report", reports_to_id: ownContact!.id })
    .select()
    .single();
  contactIds.push(report!.id);

  const vacacionesRequest = await insertApprovedVacationRequest(admin, {
    contactId: report!.id,
    requesterAppUserId: viewer.id,
    firstName: "Direct",
    lastName: "Report",
    tipo: "vacaciones",
  });
  vacationRequestIds.push(vacacionesRequest.id);

  const { data, error } = await viewer.client.rpc("get_ponchador_team_approved_leave", {
    p_period_start: "2026-08-01",
    p_period_end: "2026-08-31",
  });

  expect(error).toBeNull();
  const row = data?.find((r: { contact_id: string }) => r.contact_id === report!.id);
  expect(row?.tipo).toBe("vacaciones");
});

it("get_ponchador_all_approved_leave returns a permiso request's tipo correctly", async () => {
  superAdmin = await createTestUser("Super Admin");
  const admin = createAdminClient();

  const { data: anyone } = await admin
    .from("contacts")
    .insert({ first_name: "Anyone", last_name: "Contact" })
    .select()
    .single();
  contactIds.push(anyone!.id);

  const permisoRequest = await insertApprovedVacationRequest(admin, {
    contactId: anyone!.id,
    requesterAppUserId: superAdmin.id,
    firstName: "Anyone",
    lastName: "Contact",
    tipo: "permiso",
  });
  vacationRequestIds.push(permisoRequest.id);

  const { data, error } = await superAdmin.client.rpc("get_ponchador_all_approved_leave", {
    p_period_start: "2026-08-01",
    p_period_end: "2026-08-31",
  });

  expect(error).toBeNull();
  const row = data?.find((r: { contact_id: string }) => r.contact_id === anyone!.id);
  expect(row?.tipo).toBe("permiso");
});
```

(Adjust `insertApprovedVacationRequest`'s call shape/return value to match exactly what Step 1's extended helper actually returns — if it returns the request row, `.id` is correct; check the existing helper's return statement.)

- [ ] **Step 3: Run the tests to verify they pass**

Run: `bun run test -- ponchadorVisibility.test.ts`
Expected: PASS (16 tests total — the existing 14, plus these 2 new ones).

- [ ] **Step 4: Commit**

```bash
git add src/test/integration/ponchadorVisibility.test.ts
git commit -m "test: verify tipo is returned by the Ponchador batch leave functions"
```

---

## Task 3: `buildAttendanceGridDays` in `attendance.ts`

**Files:**
- Modify: `src/lib/attendance.ts` (append at the end of the file)
- Modify: `src/lib/attendance.test.ts`

Independent of Tasks 1/2 — pure functions, no database dependency.

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` to also import `buildAttendanceGridDays`:

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
  buildAttendanceGridDays,
} from "./attendance";
```

Then append this to the end of `src/lib/attendance.test.ts`:

```typescript

describe("buildAttendanceGridDays", () => {
  // Monday-Friday 8:00 am - 5:00 pm, zero tolerance.
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

  it("marks a day covered by an approved vacaciones range as vacaciones", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendanceGridDays(
      "2026-01-12",
      "2026-01-12",
      "2026-01-31",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      [],
    );
    expect(result).toEqual([
      { dateIso: "2026-01-12", dayNumber: 12, arrivalLabel: null, exitLabel: null, status: "vacaciones" },
    ]);
  });

  it("marks a day covered by an approved permiso range as permiso", () => {
    const result = buildAttendanceGridDays("2026-01-12", "2026-01-12", "2026-01-31", schedule, [], [], [
      { dateFrom: "2026-01-12", dateTo: "2026-01-12" },
    ]);
    expect(result[0].status).toBe("permiso");
  });

  it("prioritizes vacaciones over permiso when both cover the same day", () => {
    const result = buildAttendanceGridDays(
      "2026-01-12",
      "2026-01-12",
      "2026-01-31",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
    );
    expect(result[0].status).toBe("vacaciones");
  });

  it("marks a scheduled workday with no punch, on or before today, as ausente", () => {
    const result = buildAttendanceGridDays("2026-01-12", "2026-01-12", "2026-01-31", schedule, [], [], []);
    expect(result[0].status).toBe("ausente");
  });

  it("does not mark a future scheduled workday as ausente", () => {
    const result = buildAttendanceGridDays("2026-01-12", "2026-01-12", "2026-01-01", schedule, [], [], []);
    expect(result[0].status).toBe("normal");
  });

  it("marks a non-scheduled day (weekend) with no punch as weekend, not ausente", () => {
    // 2026-01-11 is a Sunday
    const result = buildAttendanceGridDays("2026-01-11", "2026-01-11", "2026-01-31", schedule, [], [], []);
    expect(result[0].status).toBe("weekend");
  });

  it("shows real arrival/exit times on a normal punched day, with normal status", () => {
    const result = buildAttendanceGridDays(
      "2026-01-12",
      "2026-01-12",
      "2026-01-31",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 17 * 60 }],
      [],
      [],
    );
    expect(result[0]).toEqual({
      dateIso: "2026-01-12",
      dayNumber: 12,
      arrivalLabel: "8:00 am",
      exitLabel: "5:00 pm",
      status: "normal",
    });
  });

  it("shows real punch times on a weekend day (e.g. approved overtime) while keeping weekend status", () => {
    // 2026-01-10 is a Saturday
    const result = buildAttendanceGridDays(
      "2026-01-10",
      "2026-01-10",
      "2026-01-31",
      schedule,
      [{ dateIso: "2026-01-10", arrivalMinutes: 9 * 60, exitMinutes: 12 * 60 }],
      [],
      [],
    );
    expect(result[0]).toEqual({
      dateIso: "2026-01-10",
      dayNumber: 10,
      arrivalLabel: "9:00 am",
      exitLabel: "12:00 pm",
      status: "weekend",
    });
  });

  it("enumerates every calendar day across a multi-day range, including weekends", () => {
    // Fri 2026-01-09 through Mon 2026-01-12 - 4 calendar days, not just the 2 workdays
    const result = buildAttendanceGridDays("2026-01-09", "2026-01-12", "2026-01-01", schedule, [], [], []);
    expect(result.map((d) => d.dateIso)).toEqual(["2026-01-09", "2026-01-10", "2026-01-11", "2026-01-12"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL — `buildAttendanceGridDays` is not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/attendance.ts`:

```typescript
export type GridDayStatus = "vacaciones" | "permiso" | "ausente" | "weekend" | "normal";

export interface AttendanceGridDay {
  dateIso: string;
  dayNumber: number;
  arrivalLabel: string | null;
  exitLabel: string | null;
  status: GridDayStatus;
}

// Builds one cell-pair per CALENDAR day in the period (including weekends -
// unlike buildAttendancePeriodRows, which only enumerates scheduled
// workdays), for the Vista general grid. Distinguishes vacaciones from
// permiso - buildAttendancePeriodRows deliberately keeps merging both into a
// single "permiso" Estado for the single-person dashboard, so this is a
// separate, additive function rather than a change to that one.
export function buildAttendanceGridDays(
  periodStartIso: string,
  periodEndIso: string,
  todayIso: string,
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  vacacionesRanges: ApprovedLeaveRange[],
  permisoRanges: ApprovedLeaveRange[],
): AttendanceGridDay[] {
  const scheduledDayOfWeeks = new Map(schedule.days.map((d) => [d.day_of_week, d]));
  const rowsByDate = new Map(arrivalsAndExits.map((r) => [r.dateIso, r]));

  const days: AttendanceGridDay[] = [];
  for (const dateIso of enumerateDateRange(periodStartIso, periodEndIso)) {
    const dayNumber = Number(dateIso.slice(8, 10));
    const attendance = rowsByDate.get(dateIso);
    const arrivalMinutes = attendance?.arrivalMinutes ?? null;
    const exitMinutes = attendance?.exitMinutes ?? null;
    const arrivalLabel = arrivalMinutes === null ? null : formatArrivalTime(arrivalMinutes);
    const exitLabel = exitMinutes === null ? null : formatArrivalTime(exitMinutes);

    const onVacaciones = vacacionesRanges.some((r) => isDateInRange(dateIso, r.dateFrom, r.dateTo));
    const onPermiso = permisoRanges.some((r) => isDateInRange(dateIso, r.dateFrom, r.dateTo));
    const isScheduledWorkday = scheduledDayOfWeeks.has(businessDayOfWeek(dateIso));

    let status: GridDayStatus;
    if (onVacaciones) {
      status = "vacaciones";
    } else if (onPermiso) {
      status = "permiso";
    } else if (isScheduledWorkday && arrivalMinutes === null && dateIso <= todayIso) {
      status = "ausente";
    } else if (!isScheduledWorkday) {
      status = "weekend";
    } else {
      status = "normal";
    }

    days.push({ dateIso, dayNumber, arrivalLabel, exitLabel, status });
  }
  return days;
}
```

This reuses the private `enumerateDateRange`, `isDateInRange`, and `businessDayOfWeek` helpers already defined earlier in the same file (from `buildAttendancePeriodRows`) — no new date-math helpers needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (all existing tests plus these 9 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "feat: add buildAttendanceGridDays for the Ponchador Vista general grid"
```

---

## Task 4: Add "Tipo" to the vacation request form

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx`
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.ts`
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.test.ts`

Independent of Tasks 1-3 for the form/action code itself (though the `tipo` column must exist for an actual insert to succeed against a real database — the unit-level `actions.test.ts` assertions on input validation don't require it, but any test that actually inserts does, so this task's test run should happen after Task 1's migration is applied; if running standalone, expect insert-related test failures only if Task 1 hasn't landed yet).

- [ ] **Step 1: Add `tipo` to `CreateVacationRequestInput` and the insert**

In `src/app/(app)/solicitudes/vacaciones/actions.ts`, change:

```typescript
export interface CreateVacationRequestInput {
  period: string;
  daysRequested: number;
  dateFrom: string;
  dateTo: string;
  returnDate: string;
  daysPending: number | null;
  notes: string;
}
```

to:

```typescript
export interface CreateVacationRequestInput {
  tipo: "vacaciones" | "permiso";
  period: string;
  daysRequested: number;
  dateFrom: string;
  dateTo: string;
  returnDate: string;
  daysPending: number | null;
  notes: string;
}
```

And in the `.insert({...})` call inside `createVacationRequest`, add `tipo: input.tipo,` alongside the other fields (e.g. right after `contact_id: resolved.data.contactId,`).

- [ ] **Step 2: Add the "Tipo" selector to the dialog**

In `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx`, add a `tipo` state (defaulting to `"vacaciones"`) and a small segmented toggle, matching the `inline-flex rounded-lg border p-1` pattern already used elsewhere in this codebase (e.g. `src/app/(app)/ponchador/PonchadorRosterScopeToggle.tsx`) rather than introducing a new control style. Add:

```typescript
const [tipo, setTipo] = useState<"vacaciones" | "permiso">("vacaciones");
```

Pass `tipo` through in the `createVacationRequest({...})` call (add `tipo,` to the object), and reset it back to `"vacaciones"` in the post-submit reset block alongside the other `set...("")` calls (`setTipo("vacaciones");`).

Add this JSX block near the top of the form fields (before "Período correspondiente"):

```tsx
<div className="space-y-1">
  <Label>Tipo</Label>
  <div className="inline-flex rounded-lg border p-1">
    {(["vacaciones", "permiso"] as const).map((t) => (
      <button
        key={t}
        type="button"
        onClick={() => setTipo(t)}
        className={`rounded-md px-3 py-1.5 text-sm capitalize ${
          tipo === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
        }`}
      >
        {t}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Update/extend `actions.test.ts`**

Read the current `src/app/(app)/solicitudes/vacaciones/actions.test.ts` in full first. Grep for every call site that constructs a `CreateVacationRequestInput`-shaped object passed to `createVacationRequest(...)` and add `tipo: "vacaciones"` to each (matching the DB default, so existing test expectations about stored rows don't need to change) — TypeScript will flag any you miss once `tipo` becomes a required field, so `bunx tsc --noEmit` after this step will catch omissions.

Then add one new test confirming the `permiso` path also works end to end:

```typescript
it("stores tipo = 'permiso' when explicitly requested", async () => {
  // Follow this file's existing pattern for calling createVacationRequest
  // and reading back the inserted row - construct the input with
  // tipo: "permiso" instead of "vacaciones", then assert the read-back row's
  // tipo field equals "permiso". Match the exact setup/mocking/cleanup
  // conventions already used by the other tests in this file (e.g. how a
  // successful creation's happy-path test already reads back and asserts on
  // fields of the inserted row).
});
```

(This last test's exact body depends on this file's existing mocking approach for `createClient`/`createAdminClient`/`resolveVacationSupervisor` — write it following the same setup already used by the file's existing "creates a request" test, just asserting on `tipo` instead of/in addition to whatever that test already asserts.)

- [ ] **Step 4: Run the tests and type-check**

Run: `bunx tsc --noEmit` — expect clean (confirms every `CreateVacationRequestInput` call site was updated).
Run: `bun run test -- src/app/\(app\)/solicitudes/vacaciones` — expect all tests in that directory to pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/solicitudes/vacaciones/NewVacationRequestDialog.tsx src/app/\(app\)/solicitudes/vacaciones/actions.ts src/app/\(app\)/solicitudes/vacaciones/actions.test.ts
git commit -m "feat: add a Tipo (vacaciones/permiso) field to the vacation request form"
```

---

## Task 5: `PonchadorOverviewTable.tsx` grid rewrite

**Files:**
- Modify: `src/app/(app)/ponchador/PonchadorOverviewTable.tsx`

Independent of Tasks 1-4 for compilation purposes (though it won't be wired to real data until Task 6).

The current full content of this file is:

```tsx
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PonchadorOverviewRow {
  contactId: string;
  name: string;
  departmentName?: string | null;
  averageArrivalLabel: string | null;
  diasTrabajadosLabel: string;
  puntualidadLabel: string;
  horasTrabajadasLabel: string;
  href: string;
}

export function PonchadorOverviewTable({
  rows,
  groupByDepartment,
}: {
  rows: PonchadorOverviewRow[];
  groupByDepartment: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay personas para mostrar en este período.</p>;
  }

  if (!groupByDepartment) {
    return <OverviewTableBody rows={rows} />;
  }

  const groups = new Map<string, PonchadorOverviewRow[]>();
  for (const row of rows) {
    const key = row.departmentName ?? "Sin departamento";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([department, members]) => (
          <div key={department}>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">{department}</p>
            <OverviewTableBody rows={members} caption={department} />
          </div>
        ))}
    </div>
  );
}

function OverviewTableBody({ rows, caption }: { rows: PonchadorOverviewRow[]; caption?: string }) {
  return (
    <Table>
      {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Promedio de entrada</TableHead>
          <TableHead>Días trabajados</TableHead>
          <TableHead>Puntualidad</TableHead>
          <TableHead>Horas trabajadas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.contactId}>
            <TableCell>
              <Link href={row.href} className="font-medium text-[#04B1AF] hover:underline">
                {row.name}
              </Link>
            </TableCell>
            <TableCell>{row.averageArrivalLabel ?? "Sin datos"}</TableCell>
            <TableCell>{row.diasTrabajadosLabel}</TableCell>
            <TableCell>{row.puntualidadLabel}</TableCell>
            <TableCell>{row.horasTrabajadasLabel}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 1: Replace the whole file**

Replace the entire content of `src/app/(app)/ponchador/PonchadorOverviewTable.tsx` with:

```tsx
import { Fragment } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PonchadorGridCellStatus = "vacaciones" | "permiso" | "ausente" | "weekend" | "normal";

export interface PonchadorGridDayCell {
  dayNumber: number;
  arrivalLabel: string | null;
  exitLabel: string | null;
  status: PonchadorGridCellStatus;
}

export interface PonchadorGridPersonRow {
  contactId: string;
  name: string;
  puntualidadLabel: string;
  href: string;
  days: PonchadorGridDayCell[];
}

const CELL_STATUS_CLASSNAMES: Record<PonchadorGridCellStatus, string> = {
  vacaciones: "bg-blue-100",
  permiso: "bg-orange-100",
  ausente: "bg-red-100",
  weekend: "bg-muted/40",
  normal: "",
};

export function PonchadorOverviewTable({ rows }: { rows: PonchadorGridPersonRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay personas para mostrar en este período.</p>;
  }

  const dayNumbers = rows[0].days.map((d) => d.dayNumber);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">Nombre</TableHead>
            <TableHead>E/S</TableHead>
            {dayNumbers.map((day) => (
              <TableHead key={day} className="text-center">
                {day}
              </TableHead>
            ))}
            <TableHead>%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.contactId}>
              <TableRow>
                <TableCell rowSpan={2} className="sticky left-0 bg-background align-top font-medium">
                  <Link href={row.href} className="text-[#04B1AF] hover:underline">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">E</TableCell>
                {row.days.map((day) => (
                  <TableCell
                    key={day.dayNumber}
                    className={`text-center text-xs ${CELL_STATUS_CLASSNAMES[day.status]}`}
                  >
                    {day.arrivalLabel ?? "—"}
                  </TableCell>
                ))}
                <TableCell rowSpan={2} className="align-middle font-medium">
                  {row.puntualidadLabel}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-xs text-muted-foreground">S</TableCell>
                {row.days.map((day) => (
                  <TableCell
                    key={day.dayNumber}
                    className={`text-center text-xs ${CELL_STATUS_CLASSNAMES[day.status]}`}
                  >
                    {day.exitLabel ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

Note: the "no divisions" requirement is satisfied by construction — there is only ever one `<Table>` now, and the old `groupByDepartment`/multi-table-per-department code path is gone entirely, not just unused.

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: errors ARE expected at this point — `src/app/(app)/ponchador/page.tsx` still imports `PonchadorOverviewTable`/`PonchadorOverviewRow` with the OLD props/type (Task 6 fixes this). Confirm the errors are confined to `page.tsx`'s call site, not internal to this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorOverviewTable.tsx"
git commit -m "feat: rewrite PonchadorOverviewTable as a single day-by-day grid"
```

---

## Task 6: `page.tsx` — wire the grid into the overview branch

**Files:**
- Modify: `src/app/(app)/ponchador/page.tsx`

The final task — depends on Tasks 1, 3, 5 (and should have Task 4 done too, though `page.tsx` doesn't directly touch the request form).

- [ ] **Step 1: Update imports**

Change:

```tsx
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
import { PonchadorScopeTabs, type PonchadorScope } from "./PonchadorScopeTabs";
import { PonchadorPersonSelector, type PonchadorPersonOption } from "./PonchadorPersonSelector";
import { PonchadorOverviewTable, type PonchadorOverviewRow } from "./PonchadorOverviewTable";
import { PonchadorDepartmentFilter } from "./PonchadorDepartmentFilter";
import { PonchadorRosterScopeToggle, type PonchadorRosterScope } from "./PonchadorRosterScopeToggle";
import { PeriodFilter } from "./PeriodFilter";
```

to:

```tsx
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
  buildAttendanceGridDays,
  type DailyArrival,
  type ApprovedLeaveRange,
} from "@/lib/attendance";
import { PonchadorDashboard, type PonchadorRow, type PonchadorSummary } from "./PonchadorDashboard";
import { PonchadorScopeTabs, type PonchadorScope } from "./PonchadorScopeTabs";
import { PonchadorPersonSelector, type PonchadorPersonOption } from "./PonchadorPersonSelector";
import { PonchadorOverviewTable, type PonchadorGridPersonRow } from "./PonchadorOverviewTable";
import { PonchadorDepartmentFilter } from "./PonchadorDepartmentFilter";
import { PonchadorRosterScopeToggle, type PonchadorRosterScope } from "./PonchadorRosterScopeToggle";
import { PeriodFilter } from "./PeriodFilter";
```

- [ ] **Step 2: Replace the leave-grouping and roster-row-building logic inside the `scope === "overview"` branch**

Find this block inside `if (scope === "overview") { ... }`:

```tsx
    const leaveByContact = new Map<string, ApprovedLeaveRange[]>();
    for (const l of rosterLeaveRows ?? []) {
      const list = leaveByContact.get(l.contact_id) ?? [];
      list.push({ dateFrom: l.date_from, dateTo: l.date_to });
      leaveByContact.set(l.contact_id, list);
    }

    const overviewRows: PonchadorOverviewRow[] = filteredRoster
      .map((person) => {
        const personSchedule = getEffectiveSchedule(
          person.scheduleId,
          person.departmentId ? departmentDefaultById.get(person.departmentId) : null,
          schedulesById,
          defaultSchedule,
        );
        const personArrivalsAndExits = buildDailyAttendanceRows(punchesByContact.get(person.id) ?? []);
        const personLeave = leaveByContact.get(person.id) ?? [];
        const personPeriodRows = buildAttendancePeriodRows(
          periodStartIso,
          periodEndIso,
          personSchedule,
          personArrivalsAndExits,
          personLeave,
          EARLY_DEPARTURE_THRESHOLD_MINUTES,
        );
        const personSummary = summarizeAttendancePeriod(personPeriodRows);
        const personPuntualidadTier = classifyPuntualidadLabel(personSummary.puntualidadPercent);

        return {
          contactId: person.id,
          name: person.name,
          departmentName: person.departmentName,
          averageArrivalLabel:
            personSummary.promedioEntradaMinutes === null
              ? null
              : formatArrivalTime(personSummary.promedioEntradaMinutes),
          diasTrabajadosLabel: `de ${personSummary.diasHabiles} días hábiles`,
          puntualidadLabel:
            personSummary.puntualidadPercent === null
              ? "Sin datos"
              : `${personSummary.puntualidadPercent}%${personPuntualidadTier ? ` · ${personPuntualidadTier}` : ""}`,
          horasTrabajadasLabel: formatHoursMinutes(personSummary.horasTrabajadasMinutes),
          href: `/ponchador?view=${rosterScope}&contactId=${person.id}&year=${year}&month=${month}`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
```

Replace it with:

```tsx
    const leaveByContact = new Map<string, { vacaciones: ApprovedLeaveRange[]; permiso: ApprovedLeaveRange[] }>();
    for (const l of rosterLeaveRows ?? []) {
      const entry = leaveByContact.get(l.contact_id) ?? { vacaciones: [], permiso: [] };
      const range: ApprovedLeaveRange = { dateFrom: l.date_from, dateTo: l.date_to };
      if (l.tipo === "permiso") {
        entry.permiso.push(range);
      } else {
        entry.vacaciones.push(range);
      }
      leaveByContact.set(l.contact_id, entry);
    }

    const gridRows: PonchadorGridPersonRow[] = filteredRoster
      .map((person) => {
        const personSchedule = getEffectiveSchedule(
          person.scheduleId,
          person.departmentId ? departmentDefaultById.get(person.departmentId) : null,
          schedulesById,
          defaultSchedule,
        );
        const personArrivalsAndExits = buildDailyAttendanceRows(punchesByContact.get(person.id) ?? []);
        const personLeave = leaveByContact.get(person.id) ?? { vacaciones: [], permiso: [] };

        const gridDays = buildAttendanceGridDays(
          periodStartIso,
          periodEndIsoUnclamped,
          todayIso,
          personSchedule,
          personArrivalsAndExits,
          personLeave.vacaciones,
          personLeave.permiso,
        );

        const personPeriodRows = buildAttendancePeriodRows(
          periodStartIso,
          periodEndIso,
          personSchedule,
          personArrivalsAndExits,
          [...personLeave.vacaciones, ...personLeave.permiso],
          EARLY_DEPARTURE_THRESHOLD_MINUTES,
        );
        const personSummary = summarizeAttendancePeriod(personPeriodRows);
        const personPuntualidadTier = classifyPuntualidadLabel(personSummary.puntualidadPercent);

        return {
          contactId: person.id,
          name: person.name,
          puntualidadLabel:
            personSummary.puntualidadPercent === null
              ? "Sin datos"
              : `${personSummary.puntualidadPercent}%${personPuntualidadTier ? ` · ${personPuntualidadTier}` : ""}`,
          href: `/ponchador?view=${rosterScope}&contactId=${person.id}&year=${year}&month=${month}`,
          days: gridDays.map((d) => ({
            dayNumber: d.dayNumber,
            arrivalLabel: d.arrivalLabel,
            exitLabel: d.exitLabel,
            status: d.status,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
```

Note: the grid uses `periodEndIsoUnclamped` (the full calendar month, so every day 1..N gets a column, including days later this month) while the puntualidad summary keeps using the existing clamped `periodEndIso` (so future days still don't count toward the percentage) — this mirrors exactly how the single-person branch below already treats these two differently, just now applied per-roster-person instead of once.

- [ ] **Step 3: Update the final render of the overview branch**

Find:

```tsx
        <PonchadorOverviewTable rows={overviewRows} groupByDepartment={rosterScope === "all"} />
```

Replace with:

```tsx
        <PonchadorOverviewTable rows={gridRows} />
```

- [ ] **Step 4: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors (this resolves the Task 5 type errors from the old `PonchadorOverviewRow`/`groupByDepartment` prop shape).

Run: `bun run test`
Expected: all tests pass aside from the same pre-existing Supabase-auth rate-limit flakiness confirmed at the start of this plan (25 failures out of 432 on the clean baseline) — if a failure's exact message is "Request rate limit reached" in a file this plan didn't touch, it's not a regression; re-run that file alone to confirm.

- [ ] **Step 5: Manually re-verify the single-person and "select a person" paths are unchanged**

Trace through: `scope === "self"`, `scope === "team"`/`"all"` with no `contactId` yet, and `scope === "team"`/`"all"` with a `contactId` — none of these paths reference `buildAttendanceGridDays`, `gridRows`, or the new `PonchadorGridPersonRow` type; they still build `ponchadorRows`/`PonchadorDashboard` exactly as before this task.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/ponchador/page.tsx"
git commit -m "feat: wire the day-by-day grid into the Vista general overview branch"
```

---

## Self-Review Notes

- **Spec coverage:**
  - "`vacation_requests.tipo` column, defaulting to vacaciones" → Task 1's `alter table ... add column tipo ... default 'vacaciones'`.
  - "Nueva solicitud form gains a Tipo selector" → Task 4.
  - "Single continuous table, no per-department sub-tables" → Task 5's rewrite has exactly one `<Table>`, no grouping code path at all.
  - "2 rows per person (E/S), day columns 1..N, trailing % column" → Task 5's `PonchadorOverviewTable` structure; Task 3's `buildAttendanceGridDays` supplies the per-day cells, the existing unchanged summary pipeline supplies the %.
  - "5-way cell coloring (vacaciones/permiso/ausente/weekend/normal)" → Task 3's `buildAttendanceGridDays` priority-ordered classification + Task 5's `CELL_STATUS_CLASSNAMES` map.
  - "Single-person dashboard unaffected" → no task modifies `PonchadorDashboard.tsx`, `buildAttendancePeriodRows`, or `DayEstado`; Task 6's single-person branch is untouched code.
  - Testing section → Task 2 (tipo returned by both batch functions), Task 3 (9 new `buildAttendanceGridDays` unit tests), Task 4 (permiso storage end-to-end).
  - Out-of-scope items (single-person Estado distinction, retroactive reclassification, editing tipo after submission, RRHH/supervisor screen changes) → no task touches any of them.
- **Placeholder scan:** Task 4's Step 3 has one intentionally-flexible test description (the exact mocking shape depends on this file's existing conventions, which the plan author hasn't read firsthand) — this is a deliberate "follow the existing pattern" instruction, not a placeholder for missing logic; every other step has complete, concrete code.
- **Type consistency:** `PonchadorGridDayCell`/`PonchadorGridPersonRow`/`PonchadorGridCellStatus` are defined once in Task 5 and imported (not redeclared) in Task 6. `GridDayStatus`/`AttendanceGridDay` from Task 3's `attendance.ts` use the same 5 status literals as Task 5's `PonchadorGridCellStatus` — a mismatch here would be a real bug, so double-check the two type definitions list identically `"vacaciones" | "permiso" | "ausente" | "weekend" | "normal"` when implementing. `CreateVacationRequestInput.tipo` (Task 4) and the DB column's check constraint (Task 1) both restrict to the same two values.
