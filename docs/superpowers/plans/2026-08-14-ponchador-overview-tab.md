# Ponchador "Vista General" Overview Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "Vista general" tab to `/ponchador` showing a roster table (one row per person, with their period stats) instead of requiring the viewer to pick one person at a time, for both a leader's team and (separately) the whole company.

**Architecture:** Six new/extended `security definer` SQL functions provide batch (not per-person) access to the roster's identity/schedule fields and their punches/leave for a period. `page.tsx` gains a new `scope === "overview"` branch that runs the existing, unchanged `buildAttendancePeriodRows`/`summarizeAttendancePeriod` pipeline once per person in the roster, instead of once for a single selected person.

**Tech Stack:** Next.js 16 Server Components, Supabase Postgres (`security definer` functions), TypeScript, Vitest, existing shadcn `Select`/`Table` primitives, plain `next/link` for row navigation.

**Spec:** `docs/superpowers/specs/2026-08-13-ponchador-overview-tab-design.md`.

---

## File Structure

- **Create** `supabase/migrations/20260814100000_ponchador_overview_tab.sql` — drops and recreates `list_my_ponchador_team`/`list_all_ponchador_contacts` with two extra columns, plus 4 new batch punches/leave functions.
- **Modify** `src/test/integration/ponchadorVisibility.test.ts` — 6 new test cases for the extended/new functions.
- **Create** `src/app/(app)/ponchador/PonchadorOverviewTable.tsx` — the roster table.
- **Create** `src/app/(app)/ponchador/PonchadorDepartmentFilter.tsx` — department dropdown, shown only in company-wide roster mode.
- **Create** `src/app/(app)/ponchador/PonchadorRosterScopeToggle.tsx` — "Mi equipo"/"Toda la empresa" toggle inside the overview tab, shown only when the viewer has both a team and `can_manage`.
- **Modify** `src/app/(app)/ponchador/PonchadorScopeTabs.tsx` — adds the `"overview"` scope.
- **Modify** `src/app/(app)/ponchador/page.tsx` — adds the roster data-fetching/rendering branch.
- **Untouched**: `PonchadorDashboard.tsx`, `PeriodFilter.tsx`, `PonchadorPersonSelector.tsx`, `src/lib/attendance.ts` — the existing single-person tabs (Mi Ponchador/Mi Equipo/Todos) keep working exactly as they do today.

---

## Task 1: Migration — extend the roster listings, add batch punches/leave

**Files:**
- Create: `supabase/migrations/20260814100000_ponchador_overview_tab.sql`

**Postgres gotcha this task must get right:** `list_my_ponchador_team()` and `list_all_ponchador_contacts()` are gaining two new `RETURNS TABLE(...)` columns. Postgres does **not** allow `CREATE OR REPLACE FUNCTION` to change a function's return type/OUT parameter list — attempting it fails at apply time. (This codebase already hit one migration-apply-time-only Postgres error this session — an unquoted reserved word — caught only when the human tried to paste it into Supabase. Don't repeat that class of mistake here: both functions must be explicitly dropped before being recreated.)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260814100000_ponchador_overview_tab.sql`:

```sql
-- list_my_ponchador_team's and list_all_ponchador_contacts' RETURNS TABLE
-- shape is being extended (two new columns) - Postgres does not allow
-- CREATE OR REPLACE FUNCTION to change a function's return type/OUT
-- parameter list, so both must be dropped before being recreated (learned
-- the hard way with the "position" reserved-word issue in the previous
-- Ponchador migration - verify this one actually applies cleanly).
drop function if exists public.list_my_ponchador_team();
drop function if exists public.list_all_ponchador_contacts();

-- The caller's full downward reports_to_id chain (direct reports, their
-- reports, and so on) - restricted to active contacts with a ponchador code
-- assigned, so any selector/roster this feeds never offers someone with no
-- attendance data to show. Now also returns schedule_id/department_id,
-- needed by the Vista general roster to resolve each listed person's
-- effective schedule (the same fields get_ponchador_contact_summary already
-- returns for a single person).
create function public.list_my_ponchador_team()
returns table (id uuid, first_name text, last_name text, "position" text, schedule_id uuid, department_id uuid)
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
    select c.id, c.first_name, c.last_name, c.position, c.schedule_id, c.department_id
    from public.contacts c
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = c.id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Every active contact with a ponchador code assigned - only returns rows if
-- the caller has can_manage on the ponchador module, empty otherwise. Now
-- also returns schedule_id/department_id, for the same reason as above.
create function public.list_all_ponchador_contacts()
returns table (id uuid, first_name text, last_name text, "position" text, department_name text, schedule_id uuid, department_id uuid)
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
    select c.id, c.first_name, c.last_name, c.position, d.name as department_name, c.schedule_id, c.department_id
    from public.contacts c
    left join public.departments d on d.id = c.department_id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Batch punches for every contact in the caller's downward reports_to_id
-- chain, within the window - one call instead of one-per-person, so a
-- roster of N people costs O(1) round trips, not O(N). Reuses
-- get_ponchador_descendant_ids - no new hierarchy logic.
create or replace function public.get_ponchador_team_punches(p_from timestamptz, p_to timestamptz)
returns table (contact_id uuid, punched_at timestamptz)
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
    select tcp.contact_id, tcp.punched_at
    from public.time_clock_punches tcp
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = tcp.contact_id
    where tcp.punched_at >= p_from and tcp.punched_at < p_to;
end;
$$;

-- Batch approved leave for the same downward chain, same reasoning.
create or replace function public.get_ponchador_team_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date)
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
    select vr.contact_id, vr.date_from, vr.date_to
    from public.vacation_requests vr
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = vr.contact_id
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;

-- Batch punches for every contact company-wide - gated by can_manage on the
-- ponchador module, empty otherwise, same convention as
-- list_all_ponchador_contacts.
create or replace function public.get_ponchador_all_punches(p_from timestamptz, p_to timestamptz)
returns table (contact_id uuid, punched_at timestamptz)
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
    select tcp.contact_id, tcp.punched_at
    from public.time_clock_punches tcp
    where tcp.punched_at >= p_from and tcp.punched_at < p_to;
end;
$$;

-- Batch approved leave company-wide, same gating.
create or replace function public.get_ponchador_all_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date)
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
    select vr.contact_id, vr.date_from, vr.date_to
    from public.vacation_requests vr
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;
```

- [ ] **Step 2: STOP — human applies the migration**

Do NOT paste this SQL into Supabase yourself. Tell the human the migration is ready at `supabase/migrations/20260814100000_ponchador_overview_tab.sql` and wait for them to paste it into the Supabase SQL Editor and confirm it ran successfully — specifically watch for a repeat of the `drop function`-before-`create` requirement being satisfied (if they report an error about changing a function's return type, the drop statements are missing or in the wrong order). **Do not proceed to Task 2 until they explicitly confirm.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814100000_ponchador_overview_tab.sql
git commit -m "feat: add Ponchador overview roster SQL functions"
```

---

## Task 2: Integration tests

**Files:**
- Modify: `src/test/integration/ponchadorVisibility.test.ts`

Depends on Task 1's migration being applied (confirmed by the human).

- [ ] **Step 1: Read the existing conventions first**

Read `src/test/integration/ponchadorVisibility.test.ts` in full (it already has a working `afterEach` with `contactIds`/`viewer`/`superAdmin` cleanup, reversed-order deletion for FK safety, and warn-on-error — you'll extend this, not replace it). Also read `src/test/integration/timeClockPunchesRls.test.ts` (for the exact `time_clock_devices`/`time_clock_punches` fixture pattern) and `src/test/integration/vacationRequestsRls.test.ts` (for the exact `vacation_requests` insert shape — required NOT NULL columns are `contact_id`, `requester_app_user_id`, `first_name`, `last_name`, `days_requested`, `date_from`, `date_to`, `return_date`, `status`, `supervisor_app_user_id`).

- [ ] **Step 2: Extend the shared state and `afterEach`**

Add a `deviceId` variable alongside the existing `viewer`/`superAdmin`/`contactIds`, and a `vacationRequestIds: string[]` array. Extend `afterEach` to also clean these up, in dependency-safe order: delete `time_clock_punches` by `device_id` first, then `time_clock_devices`, then `vacation_requests` by id, then the existing reversed-order `contacts` cleanup, then the test users — matching the same warn-on-error style already established for the `contacts` deletes in this file.

- [ ] **Step 3: Write the new test cases**

Add these `it` blocks to the existing `describe("Ponchador team/company visibility", ...)` block:

```typescript
it("list_my_ponchador_team includes schedule_id and department_id", async () => {
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
    .insert({
      first_name: "Direct",
      last_name: "Report",
      reports_to_id: ownContact!.id,
      hikvision_employee_no: `report-${viewer.id}`,
    })
    .select()
    .single();
  contactIds.push(report!.id);

  const { data, error } = await viewer.client.rpc("list_my_ponchador_team");

  expect(error).toBeNull();
  const row = data?.find((r: { id: string }) => r.id === report!.id);
  expect(row).toBeDefined();
  expect(row.schedule_id).toBeNull();
  expect(row.department_id).toBeNull();
});

it("list_all_ponchador_contacts includes schedule_id and department_id", async () => {
  superAdmin = await createTestUser("Super Admin");
  const admin = createAdminClient();

  const { data: anyone } = await admin
    .from("contacts")
    .insert({
      first_name: "Anyone",
      last_name: "Contact",
      hikvision_employee_no: `anyone-${superAdmin.id}`,
    })
    .select()
    .single();
  contactIds.push(anyone!.id);

  const { data, error } = await superAdmin.client.rpc("list_all_ponchador_contacts");

  expect(error).toBeNull();
  const row = data?.find((r: { id: string }) => r.id === anyone!.id);
  expect(row).toBeDefined();
  expect(row.schedule_id).toBeNull();
  expect(row.department_id).toBeNull();
});

it("get_ponchador_team_punches returns punches for a downward-chain contact but not an outsider's", async () => {
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

  const { data: outsider } = await admin
    .from("contacts")
    .insert({ first_name: "Outsider", last_name: "Contact" })
    .select()
    .single();
  contactIds.push(outsider!.id);

  const { data: device } = await admin
    .from("time_clock_devices")
    .insert({ name: "Test Device", ip_address: "192.168.1.1", username: "admin", password: "secret" })
    .select()
    .single();
  deviceId = device!.id;

  await admin.from("time_clock_punches").insert([
    {
      device_id: deviceId,
      employee_no_string: `report-${viewer.id}`,
      contact_id: report!.id,
      punched_at: "2026-08-11T12:00:00.000Z",
    },
    {
      device_id: deviceId,
      employee_no_string: `outsider-${viewer.id}`,
      contact_id: outsider!.id,
      punched_at: "2026-08-11T13:00:00.000Z",
    },
  ]);

  const { data, error } = await viewer.client.rpc("get_ponchador_team_punches", {
    p_from: "2026-08-11T00:00:00.000Z",
    p_to: "2026-08-12T00:00:00.000Z",
  });

  expect(error).toBeNull();
  const returnedContactIds = data?.map((r: { contact_id: string }) => r.contact_id);
  expect(returnedContactIds).toContain(report!.id);
  expect(returnedContactIds).not.toContain(outsider!.id);
});

it("get_ponchador_team_approved_leave returns leave for a downward-chain contact but not an outsider's", async () => {
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

  const { data: outsider } = await admin
    .from("contacts")
    .insert({ first_name: "Outsider", last_name: "Contact" })
    .select()
    .single();
  contactIds.push(outsider!.id);

  const { data: reportLeave } = await admin
    .from("vacation_requests")
    .insert({
      contact_id: report!.id,
      requester_app_user_id: viewer.id,
      first_name: "Direct",
      last_name: "Report",
      days_requested: 2,
      date_from: "2026-08-11",
      date_to: "2026-08-12",
      return_date: "2026-08-13",
      status: "aprobado",
      supervisor_app_user_id: viewer.id,
    })
    .select()
    .single();
  vacationRequestIds.push(reportLeave!.id);

  const { data: outsiderLeave } = await admin
    .from("vacation_requests")
    .insert({
      contact_id: outsider!.id,
      requester_app_user_id: viewer.id,
      first_name: "Outsider",
      last_name: "Contact",
      days_requested: 2,
      date_from: "2026-08-11",
      date_to: "2026-08-12",
      return_date: "2026-08-13",
      status: "aprobado",
      supervisor_app_user_id: viewer.id,
    })
    .select()
    .single();
  vacationRequestIds.push(outsiderLeave!.id);

  const { data, error } = await viewer.client.rpc("get_ponchador_team_approved_leave", {
    p_period_start: "2026-08-01",
    p_period_end: "2026-08-31",
  });

  expect(error).toBeNull();
  const returnedContactIds = data?.map((r: { contact_id: string }) => r.contact_id);
  expect(returnedContactIds).toContain(report!.id);
  expect(returnedContactIds).not.toContain(outsider!.id);
});

it("get_ponchador_all_punches returns empty for a non-can_manage caller and rows for a can_manage caller", async () => {
  viewer = await createTestUser("Viewer");

  const { data: emptyData, error: emptyError } = await viewer.client.rpc("get_ponchador_all_punches", {
    p_from: "2026-08-01T00:00:00.000Z",
    p_to: "2026-08-31T00:00:00.000Z",
  });
  expect(emptyError).toBeNull();
  expect(emptyData).toEqual([]);

  superAdmin = await createTestUser("Super Admin");
  const admin = createAdminClient();

  const { data: anyone } = await admin
    .from("contacts")
    .insert({
      first_name: "Anyone",
      last_name: "Contact",
      hikvision_employee_no: `anyone-${superAdmin.id}`,
    })
    .select()
    .single();
  contactIds.push(anyone!.id);

  const { data: device } = await admin
    .from("time_clock_devices")
    .insert({ name: "Test Device 2", ip_address: "192.168.1.2", username: "admin", password: "secret" })
    .select()
    .single();
  deviceId = device!.id;

  await admin.from("time_clock_punches").insert({
    device_id: deviceId,
    employee_no_string: `anyone-${superAdmin.id}`,
    contact_id: anyone!.id,
    punched_at: "2026-08-11T12:00:00.000Z",
  });

  const { data, error } = await superAdmin.client.rpc("get_ponchador_all_punches", {
    p_from: "2026-08-11T00:00:00.000Z",
    p_to: "2026-08-12T00:00:00.000Z",
  });

  expect(error).toBeNull();
  expect(data?.some((r: { contact_id: string }) => r.contact_id === anyone!.id)).toBe(true);
});

it("get_ponchador_all_approved_leave returns empty for a non-can_manage caller and rows for a can_manage caller", async () => {
  viewer = await createTestUser("Viewer");

  const { data: emptyData, error: emptyError } = await viewer.client.rpc("get_ponchador_all_approved_leave", {
    p_period_start: "2026-08-01",
    p_period_end: "2026-08-31",
  });
  expect(emptyError).toBeNull();
  expect(emptyData).toEqual([]);

  superAdmin = await createTestUser("Super Admin");
  const admin = createAdminClient();

  const { data: anyone } = await admin
    .from("contacts")
    .insert({ first_name: "Anyone", last_name: "Contact" })
    .select()
    .single();
  contactIds.push(anyone!.id);

  const { data: anyoneLeave } = await admin
    .from("vacation_requests")
    .insert({
      contact_id: anyone!.id,
      requester_app_user_id: superAdmin.id,
      first_name: "Anyone",
      last_name: "Contact",
      days_requested: 2,
      date_from: "2026-08-11",
      date_to: "2026-08-12",
      return_date: "2026-08-13",
      status: "aprobado",
      supervisor_app_user_id: superAdmin.id,
    })
    .select()
    .single();
  vacationRequestIds.push(anyoneLeave!.id);

  const { data, error } = await superAdmin.client.rpc("get_ponchador_all_approved_leave", {
    p_period_start: "2026-08-01",
    p_period_end: "2026-08-31",
  });

  expect(error).toBeNull();
  expect(data?.some((r: { contact_id: string }) => r.contact_id === anyone!.id)).toBe(true);
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- ponchadorVisibility.test.ts`
Expected: PASS (14 tests total — the existing 8, plus these 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/test/integration/ponchadorVisibility.test.ts
git commit -m "test: add integration tests for the Ponchador overview roster functions"
```

---

## Task 3: `PonchadorOverviewTable.tsx`

**Files:**
- Create: `src/app/(app)/ponchador/PonchadorOverviewTable.tsx`

Independent of Tasks 1/2. No test file (no component tests in this codebase).

- [ ] **Step 1: Write the component**

Create `src/app/(app)/ponchador/PonchadorOverviewTable.tsx`:

```tsx
import Link from "next/link";
import {
  Table,
  TableBody,
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
      {Array.from(groups.entries()).map(([department, members]) => (
        <div key={department}>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">{department}</p>
          <OverviewTableBody rows={members} />
        </div>
      ))}
    </div>
  );
}

function OverviewTableBody({ rows }: { rows: PonchadorOverviewRow[] }) {
  return (
    <Table>
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

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors (not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorOverviewTable.tsx"
git commit -m "feat: add the PonchadorOverviewTable component"
```

---

## Task 4: `PonchadorDepartmentFilter.tsx` + `PonchadorRosterScopeToggle.tsx`

**Files:**
- Create: `src/app/(app)/ponchador/PonchadorDepartmentFilter.tsx`
- Create: `src/app/(app)/ponchador/PonchadorRosterScopeToggle.tsx`

Independent of Tasks 1/2/3. No test files.

- [ ] **Step 1: Write `PonchadorDepartmentFilter.tsx`**

Create `src/app/(app)/ponchador/PonchadorDepartmentFilter.tsx`:

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

const ALL_DEPARTMENTS_VALUE = "__all__";

export function PonchadorDepartmentFilter({
  departments,
  selectedDepartment,
}: {
  departments: string[];
  selectedDepartment: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectDepartment(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_DEPARTMENTS_VALUE) {
      params.delete("department");
    } else {
      params.set("department", value);
    }
    router.push(`/ponchador?${params.toString()}`);
  }

  return (
    <Select
      value={selectedDepartment ?? ALL_DEPARTMENTS_VALUE}
      onValueChange={(value) => value && selectDepartment(value)}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_DEPARTMENTS_VALUE}>Todos los departamentos</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Note: unlike `PonchadorPersonSelector.tsx`, this `Select`'s `value` (a department name, or the sentinel) already IS its own display label, so `SelectValue` needs no render-function child here — there's no id-vs-label mismatch like the bug fixed earlier in the person selector.

- [ ] **Step 2: Write `PonchadorRosterScopeToggle.tsx`**

Create `src/app/(app)/ponchador/PonchadorRosterScopeToggle.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PonchadorRosterScope = "team" | "all";

export function PonchadorRosterScopeToggle({ rosterScope }: { rosterScope: PonchadorRosterScope }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectRosterScope(next: PonchadorRosterScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("rosterScope", next);
    params.delete("department");
    router.push(`/ponchador?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-lg border p-1">
      {(["team", "all"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => selectRosterScope(s)}
          className={`rounded-md px-3 py-1.5 text-sm ${
            rosterScope === s ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {s === "team" ? "Mi equipo" : "Toda la empresa"}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify both type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorDepartmentFilter.tsx" "src/app/(app)/ponchador/PonchadorRosterScopeToggle.tsx"
git commit -m "feat: add PonchadorDepartmentFilter and PonchadorRosterScopeToggle components"
```

---

## Task 5: Extend `PonchadorScopeTabs.tsx` to add the "overview" scope

**Files:**
- Modify: `src/app/(app)/ponchador/PonchadorScopeTabs.tsx`

- [ ] **Step 1: Replace the whole file**

Replace the entire content of `src/app/(app)/ponchador/PonchadorScopeTabs.tsx` with:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PonchadorScope = "self" | "team" | "all" | "overview";

const SCOPE_LABELS: Record<PonchadorScope, string> = {
  self: "Mi Ponchador",
  team: "Mi Equipo",
  all: "Todos",
  overview: "Vista general",
};

export function PonchadorScopeTabs({
  scope,
  hasTeam,
  canViewAll,
}: {
  scope: PonchadorScope;
  hasTeam: boolean;
  canViewAll: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const availableScopes: PonchadorScope[] = [
    "self",
    ...(hasTeam ? (["team"] as const) : []),
    ...(canViewAll ? (["all"] as const) : []),
    ...(hasTeam || canViewAll ? (["overview"] as const) : []),
  ];

  function selectScope(next: PonchadorScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    params.delete("contactId");
    params.delete("rosterScope");
    params.delete("department");
    router.push(`/ponchador?${params.toString()}`);
  }

  if (availableScopes.length < 2) return null;

  return (
    <div className="inline-flex rounded-lg border p-1">
      {availableScopes.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => selectScope(s)}
          className={`rounded-md px-3 py-1.5 text-sm ${
            scope === s ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {SCOPE_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
```

Only four things changed from the original: `PonchadorScope` gained `"overview"`; `SCOPE_LABELS` gained the `overview` entry; `availableScopes` conditionally includes `"overview"` whenever `hasTeam || canViewAll`; `selectScope` now also clears `rosterScope`/`department` (stale roster-view state shouldn't survive a switch to a different top-level tab).

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: NEW errors here, since `page.tsx` (not yet updated — that's Task 6) doesn't yet handle the `"overview"` scope value. Confirm those errors are confined to `page.tsx`, not internal to this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorScopeTabs.tsx"
git commit -m "feat: add the overview scope to PonchadorScopeTabs"
```

---

## Task 6: `page.tsx` integration

**Files:**
- Modify: `src/app/(app)/ponchador/page.tsx`

The final task — depends on Tasks 1, 3, 4, 5.

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
import { PonchadorScopeTabs, type PonchadorScope } from "./PonchadorScopeTabs";
import { PonchadorPersonSelector, type PonchadorPersonOption } from "./PonchadorPersonSelector";
import { PonchadorOverviewTable, type PonchadorOverviewRow } from "./PonchadorOverviewTable";
import { PonchadorDepartmentFilter } from "./PonchadorDepartmentFilter";
import { PonchadorRosterScopeToggle, type PonchadorRosterScope } from "./PonchadorRosterScopeToggle";

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

interface PonchadorRosterPerson {
  id: string;
  name: string;
  departmentName: string | null;
  scheduleId: string | null;
  departmentId: string | null;
}

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
  searchParams: Promise<{
    year?: string;
    month?: string;
    view?: string;
    contactId?: string;
    rosterScope?: string;
    department?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "ponchador",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }
  const canViewAll = flagsRows[0].can_manage ?? false;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: myContactRow }, { data: teamRows }, { data: allRows }] = await Promise.all([
    supabase.from("contacts").select("id, hikvision_employee_no").eq("email", user!.email!).maybeSingle(),
    supabase.rpc("list_my_ponchador_team"),
    supabase.rpc("list_all_ponchador_contacts"),
  ]);

  if (!myContactRow?.hikvision_employee_no) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
        <p className="text-sm text-muted-foreground">No tienes código de ponchador asignado.</p>
      </div>
    );
  }
  const myContactId: string = myContactRow.id;

  const team: PonchadorPersonOption[] = (teamRows ?? []).map(
    (r: { id: string; first_name: string; last_name: string }) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
    }),
  );
  const hasTeam = team.length > 0;

  let allPeople: PonchadorPersonOption[] = [];
  if (canViewAll) {
    allPeople = (allRows ?? []).map(
      (r: { id: string; first_name: string; last_name: string; department_name: string | null }) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        departmentName: r.department_name,
      }),
    );
  }

  // Same rows list_my_ponchador_team/list_all_ponchador_contacts already
  // fetched above, remapped with the schedule_id/department_id fields the
  // Vista general roster needs - no additional RPC calls required.
  const teamRoster: PonchadorRosterPerson[] = (teamRows ?? []).map(
    (r: { id: string; first_name: string; last_name: string; schedule_id: string | null; department_id: string | null }) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      departmentName: null,
      scheduleId: r.schedule_id,
      departmentId: r.department_id,
    }),
  );

  const allRoster: PonchadorRosterPerson[] = canViewAll
    ? (allRows ?? []).map(
        (r: {
          id: string;
          first_name: string;
          last_name: string;
          department_name: string | null;
          schedule_id: string | null;
          department_id: string | null;
        }) => ({
          id: r.id,
          name: `${r.first_name} ${r.last_name}`.trim(),
          departmentName: r.department_name,
          scheduleId: r.schedule_id,
          departmentId: r.department_id,
        }),
      )
    : [];

  const params = await searchParams;
  const requestedScope = params.view;
  const scope: PonchadorScope =
    requestedScope === "team" && hasTeam
      ? "team"
      : requestedScope === "all" && canViewAll
        ? "all"
        : requestedScope === "overview" && (hasTeam || canViewAll)
          ? "overview"
          : "self";

  const targetContactId: string | null = scope === "self" ? myContactId : (params.contactId ?? null);

  const today = getBusinessToday();
  const todayIso = today.toISOString().slice(0, 10);
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

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

  // Moved up from later in the file: both the "overview" branch below and
  // the existing single-person branch need these, so they're computed once
  // here rather than twice.
  const windowStartIso = new Date(
    new Date(`${periodStartIso}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEndIso = new Date(
    new Date(`${periodEndIsoUnclamped}T00:00:00.000Z`).getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const scopeTabs = <PonchadorScopeTabs scope={scope} hasTeam={hasTeam} canViewAll={canViewAll} />;

  function pageHeader(title: string) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {scopeTabs}
      </div>
    );
  }

  if (scope === "overview") {
    const rosterScope: PonchadorRosterScope =
      params.rosterScope === "all" && canViewAll
        ? "all"
        : params.rosterScope === "team" && hasTeam
          ? "team"
          : hasTeam
            ? "team"
            : "all";

    const roster = rosterScope === "team" ? teamRoster : allRoster;

    const selectedDepartment = rosterScope === "all" ? (params.department ?? null) : null;
    const departmentNames = Array.from(
      new Set(allRoster.map((p) => p.departmentName).filter((d): d is string => !!d)),
    ).sort();

    const filteredRoster =
      rosterScope === "all" && selectedDepartment
        ? roster.filter((p) => p.departmentName === selectedDepartment)
        : roster;

    const [{ schedulesById, defaultSchedule }, { data: departments }, { data: rosterPunchRows }, { data: rosterLeaveRows }] =
      await Promise.all([
        getScheduleTemplatesContext(),
        supabase.from("departments").select("id, default_schedule_id"),
        rosterScope === "team"
          ? supabase.rpc("get_ponchador_team_punches", { p_from: windowStartIso, p_to: windowEndIso })
          : supabase.rpc("get_ponchador_all_punches", { p_from: windowStartIso, p_to: windowEndIso }),
        rosterScope === "team"
          ? supabase.rpc("get_ponchador_team_approved_leave", {
              p_period_start: periodStartIso,
              p_period_end: periodEndIso,
            })
          : supabase.rpc("get_ponchador_all_approved_leave", {
              p_period_start: periodStartIso,
              p_period_end: periodEndIso,
            }),
      ]);

    const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));

    const punchesByContact = new Map<string, string[]>();
    for (const p of rosterPunchRows ?? []) {
      const list = punchesByContact.get(p.contact_id) ?? [];
      list.push(p.punched_at);
      punchesByContact.set(p.contact_id, list);
    }

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

    return (
      <div className="space-y-4 p-6">
        {pageHeader("Ponchador")}
        <div className="flex flex-wrap items-center gap-3">
          {hasTeam && canViewAll && <PonchadorRosterScopeToggle rosterScope={rosterScope} />}
          {rosterScope === "all" && (
            <PonchadorDepartmentFilter departments={departmentNames} selectedDepartment={selectedDepartment} />
          )}
        </div>
        <PonchadorOverviewTable rows={overviewRows} groupByDepartment={rosterScope === "all"} />
      </div>
    );
  }

  if (scope !== "self" && !targetContactId) {
    return (
      <div className="space-y-4 p-6">
        {pageHeader("Ponchador")}
        <PonchadorPersonSelector
          people={scope === "team" ? team : allPeople}
          contactId={null}
          groupByDepartment={scope === "all"}
        />
        <p className="text-sm text-muted-foreground">Selecciona una persona para ver su registro.</p>
      </div>
    );
  }

  const { data: contactSummaryRows, error: contactSummaryError } = await supabase.rpc(
    "get_ponchador_contact_summary",
    { p_contact_id: targetContactId },
  );

  let effectiveContactId = targetContactId as string;
  let viewedContact = contactSummaryRows?.[0];

  if (contactSummaryError || !viewedContact) {
    effectiveContactId = myContactId;
    const fallback = await supabase.rpc("get_ponchador_contact_summary", { p_contact_id: myContactId });
    viewedContact = fallback.data?.[0];
  }

  if (!viewedContact) {
    redirect("/ponchador");
  }

  const isViewingSelf = effectiveContactId === myContactId;

  const [
    { schedulesById, defaultSchedule },
    { data: departments },
    { data: punchRows },
    { data: leaveRows },
  ] = await Promise.all([
    getScheduleTemplatesContext(),
    supabase.from("departments").select("id, default_schedule_id"),
    supabase.rpc("get_ponchador_punches", {
      p_contact_id: effectiveContactId,
      p_from: windowStartIso,
      p_to: windowEndIso,
    }),
    supabase.rpc("get_ponchador_approved_leave", {
      p_contact_id: effectiveContactId,
      p_period_start: periodStartIso,
      p_period_end: periodEndIso,
    }),
  ]);

  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));
  const targetSchedule = getEffectiveSchedule(
    viewedContact.schedule_id,
    viewedContact.department_id ? departmentDefaultById.get(viewedContact.department_id) : null,
    schedulesById,
    defaultSchedule,
  );

  const arrivalsAndExits = buildDailyAttendanceRows((punchRows ?? []).map((p: { punched_at: string }) => p.punched_at));

  const approvedLeave: ApprovedLeaveRange[] = (leaveRows ?? []).map((r: { date_from: string; date_to: string }) => ({
    dateFrom: r.date_from,
    dateTo: r.date_to,
  }));

  const periodRows = buildAttendancePeriodRows(
    periodStartIso,
    periodEndIso,
    targetSchedule,
    arrivalsAndExits,
    approvedLeave,
    EARLY_DEPARTURE_THRESHOLD_MINUTES,
  );
  const summary = summarizeAttendancePeriod(periodRows);
  const puntualidadTierLabel = classifyPuntualidadLabel(summary.puntualidadPercent);

  let motivationalPhrase: string | null = null;
  let averageArrivalDeltaLabel: string | null = null;
  if (isViewingSelf) {
    const periodArrivals: DailyArrival[] = periodRows
      .filter((r): r is typeof r & { arrivalMinutes: number } => r.arrivalMinutes !== null)
      .map((r) => ({ dateIso: r.dateIso, arrivalMinutes: r.arrivalMinutes }));
    const comparison = attachScheduleComparison(periodArrivals, targetSchedule);
    const avgMinutesEarly = averageMinutesEarly(comparison);
    if (avgMinutesEarly !== null) {
      const tier = classifyArrivalTier(avgMinutesEarly, targetSchedule.tolerance_minutes);
      motivationalPhrase = pickMotivationalPhrase(tier, viewedContact.first_name, today.getUTCDate());
      const roundedDelta = Math.round(Math.abs(avgMinutesEarly));
      averageArrivalDeltaLabel = `${roundedDelta} min ${avgMinutesEarly >= 0 ? "temprano" : "tarde"}`;
    }
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
  const scheduleFooterNote = `${isViewingSelf ? "Tu horario" : "Horario"}: ${formatScheduleLine(targetSchedule)}. Tolerancia: ${targetSchedule.tolerance_minutes} minutos.`;
  const pageTitle = isViewingSelf ? "Ponchador" : `Ponchador de ${viewedContact.first_name} ${viewedContact.last_name}`;

  return (
    <div className="space-y-4 p-6">
      {pageHeader(pageTitle)}
      {scope !== "self" && (
        <PonchadorPersonSelector
          people={scope === "team" ? team : allPeople}
          contactId={effectiveContactId}
          groupByDepartment={scope === "all"}
        />
      )}
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
Expected: no errors (this resolves the Task 5 "overview" type error).

Run: `bun run test`
Expected: all tests pass aside from the same pre-existing Supabase-auth rate-limit flakiness confirmed at the start of this plan (9 failures out of 426 on the clean baseline) - if a failure's exact message is "Request rate limit reached" in a file this plan didn't touch, re-run that file alone to confirm it's not a regression.

- [ ] **Step 3: Manually re-verify the self-view path**

Trace through the code for the no-query-params case (a plain visit to `/ponchador`): confirm `requestedScope` is `undefined`, so `scope` resolves to `"self"`; confirm the `if (scope === "overview")` branch is skipped entirely; confirm everything below it (schedule resolution, punches/leave fetch, motivational phrase, rendering) is byte-for-byte the same code path as before this task, just with `windowStartIso`/`windowEndIso` computed earlier in the function rather than later — the values themselves are unchanged.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ponchador/page.tsx"
git commit -m "feat: add the Vista general overview roster to page.tsx"
```

---

## Self-Review Notes

- **Spec coverage:**
  - "4th tab, Vista general, additive to the existing 3" → Task 5's `availableScopes` addition + Task 6's `scope === "overview"` branch; Mi Ponchador/Mi Equipo/Todos code paths are untouched below the new branch.
  - "Team roster by default if you have a team; toggle to company-wide if you also have can_manage" → Task 6's `rosterScope` resolution (`hasTeam` default, `canViewAll` required for `"all"`) and the `hasTeam && canViewAll` guard around rendering `PonchadorRosterScopeToggle`.
  - "Department filter only applies in company-wide mode" → Task 6's `selectedDepartment = rosterScope === "all" ? ... : null` and the `rosterScope === "all"` guard around rendering `PonchadorDepartmentFilter`; Task 5's `selectScope` clears `department` when leaving the overview tab entirely, and `PonchadorRosterScopeToggle`'s own `selectRosterScope` clears it when switching between team/company within the tab.
  - "Same 4 stats as the individual dashboard, one row per person" → Task 3's `PonchadorOverviewTable` columns match `averageArrivalLabel`/`diasTrabajadosLabel`/`puntualidadLabel`/`horasTrabajadasLabel`, computed in Task 6 via the SAME `buildAttendancePeriodRows`/`summarizeAttendancePeriod`/`classifyPuntualidadLabel` pipeline the individual view already uses, just looped per person.
  - "Row click drills into the existing individual dashboard" → Task 3's `href` field, built in Task 6 as `/ponchador?view=${rosterScope}&contactId=${person.id}&year=${year}&month=${month}` — reuses the existing single-person code path entirely, no new detail view built.
  - "Avoid N+1 queries" → Task 1's 4 new batch functions (one call for the whole roster's punches, one for the whole roster's leave) plus the schedule_id/department_id extension to the existing list functions, so Task 6's roster loop does zero additional database round trips per person.
  - "Grouped by department only in company-wide mode" → Task 3's `groupByDepartment` prop, passed as `rosterScope === "all"` in Task 6.
  - Testing section → Task 2's 6 new tests cover: extended columns on both list functions, team-batch punches/leave scoping (chain member included, outsider excluded), and all-batch punches/leave gating (empty for non-can_manage, populated for can_manage).
  - Out of scope items (sortable columns, export, editing from this view, department filter for "Mi equipo") → no task implements any of them, confirming they were correctly left out.
- **Placeholder scan:** none found — every step has complete, concrete code.
- **Type consistency:** `PonchadorRosterPerson { id, name, departmentName, scheduleId, departmentId }` is defined once in Task 6 and used consistently for both `teamRoster`/`allRoster`. `PonchadorOverviewRow` (Task 3) and `PonchadorRosterScope` (Task 4) are each defined once and imported (not redeclared) in Task 6. The extended SQL functions' column names (`schedule_id`, `department_id`, `contact_id`, `punched_at`, `date_from`, `date_to`) match exactly what Task 6's mapping code destructures from each `.rpc(...)` result. `PonchadorScope` (Task 5) gains `"overview"` and Task 6's `scope` variable is typed against that same updated union — no separate/parallel scope type was introduced.
- **Known, intentional test-suite disruption:** Task 5's own `bunx tsc --noEmit` step explicitly expects new errors (`page.tsx` not yet updated to handle `"overview"`) — called out so whoever executes this doesn't mistake it for a regression or prematurely touch `page.tsx` out of task order.
