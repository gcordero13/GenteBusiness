# Ponchador Team/Company Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let leaders view the Ponchador of everyone in their full downward reporting chain, and let users with a new `can_manage` permission on the `ponchador` module view any active employee's Ponchador, via tabs on the already-shipped `/ponchador` page.

**Architecture:** All cross-person data access goes through six small `security definer` SQL functions that each independently re-derive and enforce a single access rule (self, downward `reports_to_id` chain, or `can_manage`) — nothing about "who can see whom" lives in application code. `page.tsx` is refactored so even the self-view routes through the same functions, giving the whole feature one unified data path instead of a separate legacy path for "me" vs. everyone else.

**Tech Stack:** Next.js 16 Server Components, Supabase Postgres (`security definer` functions, no RLS-policy changes), TypeScript, Vitest, existing shadcn `Select` primitives (no new UI dependency for tabs — reuses the existing segmented-button-group pattern).

**Spec:** `docs/superpowers/specs/2026-08-13-ponchador-team-visibility-design.md`.

---

## File Structure

- **Create** `supabase/migrations/20260813100000_ponchador_team_visibility.sql` — the six SQL functions plus a default `can_manage` grant for "Super Admin".
- **Create** `src/test/integration/ponchadorVisibility.test.ts` — integration tests for all six functions.
- **Create** `src/app/(app)/ponchador/PonchadorScopeTabs.tsx` — the Mi Ponchador / Mi Equipo / Todos tab switcher.
- **Create** `src/app/(app)/ponchador/PonchadorPersonSelector.tsx` — the person dropdown shown inside the team/all tabs.
- **Modify** `src/app/(app)/ponchador/page.tsx` — full rewrite of the data-fetching body to route through the new functions and render the new tabs/selector.
- **Untouched**: `src/app/(app)/ponchador/PonchadorDashboard.tsx`, `src/app/(app)/ponchador/PeriodFilter.tsx`, `src/lib/attendance.ts` — every new behavior is additive in `page.tsx` plus the two brand-new components above.

---

## Task 1: Migration — the six visibility functions

**Files:**
- Create: `supabase/migrations/20260813100000_ponchador_team_visibility.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813100000_ponchador_team_visibility.sql`:

```sql
-- Central check reused by every Ponchador cross-person data function below:
-- can the caller view p_contact_id's Ponchador? Yes if it's their own
-- contact, if they have can_manage on the ponchador module, or if
-- p_contact_id is found anywhere in their downward reports_to_id chain (not
-- just direct reports - the full chain, however many levels deep).
create or replace function public.can_view_ponchador_contact(p_contact_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_contact_id uuid;
  can_manage_all boolean;
begin
  select c.id into my_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  if my_contact_id is null then
    return false;
  end if;

  if p_contact_id = my_contact_id then
    return true;
  end if;

  select coalesce((select can_manage from public.get_my_module_permissions('ponchador')), false)
  into can_manage_all;

  if can_manage_all then
    return true;
  end if;

  return exists (
    with recursive descendants as (
      select cc.id from public.contacts cc where cc.reports_to_id = my_contact_id
      union all
      select cc.id from public.contacts cc
      join descendants d on cc.reports_to_id = d.id
    )
    select 1 from descendants where id = p_contact_id
  );
end;
$$;

create or replace function public.get_ponchador_contact_summary(p_contact_id uuid)
returns table (
  first_name text,
  last_name text,
  schedule_id uuid,
  department_id uuid,
  hikvision_employee_no text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select c.first_name, c.last_name, c.schedule_id, c.department_id, c.hikvision_employee_no
    from public.contacts c
    where c.id = p_contact_id;
end;
$$;

create or replace function public.get_ponchador_punches(p_contact_id uuid, p_from timestamptz, p_to timestamptz)
returns table (punched_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select tcp.punched_at
    from public.time_clock_punches tcp
    where tcp.contact_id = p_contact_id
      and tcp.punched_at >= p_from
      and tcp.punched_at < p_to;
end;
$$;

create or replace function public.get_ponchador_approved_leave(p_contact_id uuid, p_period_start date, p_period_end date)
returns table (date_from date, date_to date)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select vr.date_from, vr.date_to
    from public.vacation_requests vr
    where vr.contact_id = p_contact_id
      and vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;

-- The caller's full downward reports_to_id chain (direct reports, their
-- reports, and so on) - restricted to active contacts with a ponchador code
-- assigned, so the selector this feeds never offers someone with no
-- attendance data to show.
create or replace function public.list_my_ponchador_team()
returns table (id uuid, first_name text, last_name text, position text)
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
    with recursive descendants as (
      select cc.id from public.contacts cc where cc.reports_to_id = my_contact_id
      union all
      select cc.id from public.contacts cc
      join descendants d on cc.reports_to_id = d.id
    )
    select c.id, c.first_name, c.last_name, c.position
    from public.contacts c
    join descendants d on d.id = c.id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Every active contact with a ponchador code assigned - only returns rows if
-- the caller has can_manage on the ponchador module, empty otherwise.
create or replace function public.list_all_ponchador_contacts()
returns table (id uuid, first_name text, last_name text, position text, department_name text)
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
    select c.id, c.first_name, c.last_name, c.position, d.name as department_name
    from public.contacts c
    left join public.departments d on d.id = c.department_id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Grant "Todos" visibility to Super Admin by default, same as can_view was
-- granted to Super Admin when the ponchador module was first created.
update public.role_profile_permissions rpp
set can_manage = true
from public.role_profiles rp, public.modules m
where rpp.role_profile_id = rp.id
  and rpp.module_id = m.id
  and m.key = 'ponchador'
  and rp.name = 'Super Admin';
```

- [ ] **Step 2: STOP — human applies the migration**

Do NOT paste this SQL into Supabase yourself. Tell the human the migration is ready at `supabase/migrations/20260813100000_ponchador_team_visibility.sql` and wait for them to paste it into the Supabase SQL Editor and confirm it ran successfully. **Do not proceed to Task 2 until they explicitly confirm.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813100000_ponchador_team_visibility.sql
git commit -m "feat: add Ponchador team/company visibility SQL functions"
```

---

## Task 2: Integration tests

**Files:**
- Create: `src/test/integration/ponchadorVisibility.test.ts`

Depends on Task 1's migration being applied (confirmed by the human) — these tests call the real functions against the real database.

- [ ] **Step 1: Write the tests**

Create `src/test/integration/ponchadorVisibility.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("Ponchador team/company visibility", () => {
  let viewer: TestUser | undefined;
  let superAdmin: TestUser | undefined;
  let contactIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    for (const id of contactIds) {
      await admin.from("contacts").delete().eq("id", id);
    }
    contactIds = [];
    if (viewer) await deleteTestUser(viewer.id);
    if (superAdmin) await deleteTestUser(superAdmin.id);
    viewer = undefined;
    superAdmin = undefined;
  });

  it("lets a user view their own contact's summary", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Viewer", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: ownContact!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Viewer");
  });

  it("lets a user view a direct report's summary", async () => {
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

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: report!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Direct");
  });

  it("lets a user view a report-of-a-report two levels down", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "TopLead", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: middleReport } = await admin
      .from("contacts")
      .insert({ first_name: "Middle", last_name: "Report", reports_to_id: ownContact!.id })
      .select()
      .single();
    contactIds.push(middleReport!.id);

    const { data: deepReport } = await admin
      .from("contacts")
      .insert({ first_name: "Deep", last_name: "Report", reports_to_id: middleReport!.id })
      .select()
      .single();
    contactIds.push(deepReport!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: deepReport!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Deep");
  });

  it("rejects viewing a contact outside the caller's chain without can_manage", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Viewer", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: outsider } = await admin
      .from("contacts")
      .insert({ first_name: "Outsider", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(outsider!.id);

    const { data, error } = await viewer.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: outsider!.id,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("lets a can_manage user view any contact regardless of hierarchy", async () => {
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: outsider } = await admin
      .from("contacts")
      .insert({ first_name: "Anyone", last_name: "Contact" })
      .select()
      .single();
    contactIds.push(outsider!.id);

    const { data, error } = await superAdmin.client.rpc("get_ponchador_contact_summary", {
      p_contact_id: outsider!.id,
    });

    expect(error).toBeNull();
    expect(data?.[0]?.first_name).toBe("Anyone");
  });

  it("list_my_ponchador_team returns the full downward chain, not just direct reports", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "TopLead", last_name: "Self", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: middleReport } = await admin
      .from("contacts")
      .insert({
        first_name: "Middle",
        last_name: "Report",
        reports_to_id: ownContact!.id,
        hikvision_employee_no: `middle-${viewer.id}`,
      })
      .select()
      .single();
    contactIds.push(middleReport!.id);

    const { data: deepReport } = await admin
      .from("contacts")
      .insert({
        first_name: "Deep",
        last_name: "Report",
        reports_to_id: middleReport!.id,
        hikvision_employee_no: `deep-${viewer.id}`,
      })
      .select()
      .single();
    contactIds.push(deepReport!.id);

    const { data, error } = await viewer.client.rpc("list_my_ponchador_team");

    expect(error).toBeNull();
    expect(data?.map((r: { id: string }) => r.id).sort()).toEqual(
      [middleReport!.id, deepReport!.id].sort(),
    );
  });

  it("list_all_ponchador_contacts returns empty for a caller without can_manage", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.rpc("list_all_ponchador_contacts");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("list_all_ponchador_contacts returns contacts for a can_manage caller", async () => {
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
    expect(data?.some((r: { id: string }) => r.id === anyone!.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun run test -- ponchadorVisibility.test.ts`
Expected: PASS (8 tests). If any test fails with a permissions error, re-check that Task 1's migration was actually applied (ask the human to confirm again) before assuming the test code is wrong.

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/ponchadorVisibility.test.ts
git commit -m "test: add integration tests for Ponchador visibility functions"
```

---

## Task 3: `PonchadorScopeTabs.tsx`

**Files:**
- Create: `src/app/(app)/ponchador/PonchadorScopeTabs.tsx`

Independent of Tasks 1/2 — no database dependency, can be built and reviewed in parallel.

No test file — this codebase has no component-level tests anywhere (confirmed convention).

- [ ] **Step 1: Write the component**

First read `src/app/(app)/(admin)/maintenance/MaintenanceFilters.tsx` to confirm the exact segmented-button-group classNames this codebase already uses for a toggle control (`inline-flex rounded-lg border p-1` wrapper, `bg-muted font-medium` active state, `text-muted-foreground hover:bg-muted/50` inactive state) — this codebase has no shadcn Tabs primitive (`src/components/ui/` has no `tabs.tsx`), so this component reuses that existing pattern rather than introducing a new UI dependency.

Create `src/app/(app)/ponchador/PonchadorScopeTabs.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type PonchadorScope = "self" | "team" | "all";

const SCOPE_LABELS: Record<PonchadorScope, string> = {
  self: "Mi Ponchador",
  team: "Mi Equipo",
  all: "Todos",
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
  ];

  function selectScope(next: PonchadorScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    params.delete("contactId");
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

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors (not imported anywhere yet — a real usage check happens in Task 5).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorScopeTabs.tsx"
git commit -m "feat: add the PonchadorScopeTabs client component"
```

---

## Task 4: `PonchadorPersonSelector.tsx`

**Files:**
- Create: `src/app/(app)/ponchador/PonchadorPersonSelector.tsx`

Independent of Tasks 1/2/3.

No test file — same convention as Task 3.

- [ ] **Step 1: Write the component**

Create `src/app/(app)/ponchador/PonchadorPersonSelector.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PonchadorPersonOption {
  id: string;
  name: string;
  departmentName?: string | null;
}

export function PonchadorPersonSelector({
  people,
  contactId,
  groupByDepartment,
}: {
  people: PonchadorPersonOption[];
  contactId: string | null;
  groupByDepartment: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectPerson(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contactId", nextId);
    router.push(`/ponchador?${params.toString()}`);
  }

  if (!groupByDepartment) {
    return (
      <Select value={contactId ?? undefined} onValueChange={(value) => value && selectPerson(value)}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Selecciona una persona" />
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const groups = new Map<string, PonchadorPersonOption[]>();
  for (const p of people) {
    const key = p.departmentName ?? "Sin departamento";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return (
    <Select value={contactId ?? undefined} onValueChange={(value) => value && selectPerson(value)}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Selecciona una persona" />
      </SelectTrigger>
      <SelectContent>
        {Array.from(groups.entries()).map(([department, members]) => (
          <SelectGroup key={department}>
            <SelectLabel>{department}</SelectLabel>
            {members.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorPersonSelector.tsx"
git commit -m "feat: add the PonchadorPersonSelector client component"
```

---

## Task 5: `page.tsx` integration

**Files:**
- Modify: `src/app/(app)/ponchador/page.tsx`

Depends on Task 1's migration being applied, and Tasks 3/4's components existing. Task 2's tests should also be complete before this task is considered fully done, since they're the only verification that the new SQL functions actually behave correctly.

Before starting, read the current full content of `src/app/(app)/ponchador/PonchadorDashboard.tsx` and `src/app/(app)/ponchador/PeriodFilter.tsx` and confirm neither needs to change for this feature — `PonchadorDashboard` already accepts `motivationalPhrase: string | null` and conditionally renders it, so passing `null` when viewing someone else requires no component change.

This project's Supabase client (`@/lib/supabase/server`'s `createClient()`) is not typed against a generated `Database` type (confirmed by reading `src/lib/supabase/server.ts` — no `Database` generic anywhere), so calling brand-new `.rpc()` functions works with the same loose typing the existing `get_my_module_permissions` call already has. No type generation step is needed.

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
  searchParams: Promise<{ year?: string; month?: string; view?: string; contactId?: string }>;
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

  const { data: myContactRow } = await supabase
    .from("contacts")
    .select("id, hikvision_employee_no")
    .eq("email", user!.email!)
    .maybeSingle();

  if (!myContactRow?.hikvision_employee_no) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
        <p className="text-sm text-muted-foreground">No tienes código de ponchador asignado.</p>
      </div>
    );
  }
  const myContactId: string = myContactRow.id;

  const { data: teamRows } = await supabase.rpc("list_my_ponchador_team");
  const team: PonchadorPersonOption[] = (teamRows ?? []).map(
    (r: { id: string; first_name: string; last_name: string }) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
    }),
  );
  const hasTeam = team.length > 0;

  let allPeople: PonchadorPersonOption[] = [];
  if (canViewAll) {
    const { data: allRows } = await supabase.rpc("list_all_ponchador_contacts");
    allPeople = (allRows ?? []).map(
      (r: { id: string; first_name: string; last_name: string; department_name: string | null }) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        departmentName: r.department_name,
      }),
    );
  }

  const params = await searchParams;
  const requestedScope = params.view;
  const scope: PonchadorScope =
    requestedScope === "team" && hasTeam ? "team" : requestedScope === "all" && canViewAll ? "all" : "self";

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

  const scopeTabs = <PonchadorScopeTabs scope={scope} hasTeam={hasTeam} canViewAll={canViewAll} />;

  if (scope !== "self" && !targetContactId) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Ponchador</h1>
          {scopeTabs}
        </div>
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
    // Invalid/tampered contactId, or the caller lost access since a link was
    // shared (e.g. no longer manages that person) - fall back to their own
    // contact rather than erroring.
    effectiveContactId = myContactId;
    const fallback = await supabase.rpc("get_ponchador_contact_summary", { p_contact_id: myContactId });
    viewedContact = fallback.data?.[0];
  }

  if (!viewedContact) {
    // Shouldn't be reachable - myContactId was already confirmed to exist
    // above - but keeps the page from crashing if it somehow is.
    redirect("/ponchador");
  }

  const isViewingSelf = effectiveContactId === myContactId;

  const { schedulesById, defaultSchedule } = await getScheduleTemplatesContext();
  const { data: departments } = await supabase.from("departments").select("id, default_schedule_id");
  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));
  const viewerSchedule = getEffectiveSchedule(
    viewedContact.schedule_id,
    viewedContact.department_id ? departmentDefaultById.get(viewedContact.department_id) : null,
    schedulesById,
    defaultSchedule,
  );

  const windowStartIso = new Date(
    new Date(`${periodStartIso}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEndIso = new Date(
    new Date(`${periodEndIsoUnclamped}T00:00:00.000Z`).getTime() + 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: punchRows } = await supabase.rpc("get_ponchador_punches", {
    p_contact_id: effectiveContactId,
    p_from: windowStartIso,
    p_to: windowEndIso,
  });
  const arrivalsAndExits = buildDailyAttendanceRows((punchRows ?? []).map((p: { punched_at: string }) => p.punched_at));

  const { data: leaveRows } = await supabase.rpc("get_ponchador_approved_leave", {
    p_contact_id: effectiveContactId,
    p_period_start: periodStartIso,
    p_period_end: periodEndIso,
  });
  const approvedLeave: ApprovedLeaveRange[] = (leaveRows ?? []).map((r: { date_from: string; date_to: string }) => ({
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

  let motivationalPhrase: string | null = null;
  let averageArrivalDeltaLabel: string | null = null;
  if (isViewingSelf) {
    const periodArrivals: DailyArrival[] = periodRows
      .filter((r): r is typeof r & { arrivalMinutes: number } => r.arrivalMinutes !== null)
      .map((r) => ({ dateIso: r.dateIso, arrivalMinutes: r.arrivalMinutes }));
    const comparison = attachScheduleComparison(periodArrivals, viewerSchedule);
    const avgMinutesEarly = averageMinutesEarly(comparison);
    if (avgMinutesEarly !== null) {
      const tier = classifyArrivalTier(avgMinutesEarly, viewerSchedule.tolerance_minutes);
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
  const scheduleFooterNote = `${isViewingSelf ? "Tu horario" : "Horario"}: ${formatScheduleLine(viewerSchedule)}. Tolerancia: ${viewerSchedule.tolerance_minutes} minutos.`;
  const pageTitle = isViewingSelf ? "Ponchador" : `Ponchador de ${viewedContact.first_name} ${viewedContact.last_name}`;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{pageTitle}</h1>
        {scopeTabs}
      </div>
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
Expected: no errors.

Run: `bun run test`
Expected: all tests pass, aside from the same pre-existing Supabase-auth rate-limit flakiness confirmed at the start of this plan (7 failures out of 418 on the clean baseline) - if a failure's exact message is "Request rate limit reached" in a file this plan didn't touch, it's not a regression; re-run that file alone to confirm.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/page.tsx"
git commit -m "feat: wire team/company Ponchador visibility into page.tsx"
```

---

## Self-Review Notes

- **Spec coverage:**
  - "Super users can view any active employee's Ponchador" → Task 1's `can_manage`-branch in `can_view_ponchador_contact` + Task 1's default grant to Super Admin + Task 5's `canViewAll`/"Todos" wiring.
  - "Leaders can view their full downward reporting chain" → Task 1's recursive-CTE branch in `can_view_ponchador_contact` and in `list_my_ponchador_team`, proven by Task 2's two-level recursive test, wired into Task 5's `hasTeam`/"Mi Equipo" handling.
  - "can_manage assignable per role profile, not hardcoded" → Task 1 only sets a default grant for Super Admin; the flag itself is a normal `role_profile_permissions` column editable from the existing "Perfiles de rol" screen for any profile - no code changes needed to grant it elsewhere.
  - "Tabs: Mi Ponchador / Mi Equipo / Todos, with a person selector" → Task 3 (tabs) + Task 4 (selector, grouped by department for "Todos") + Task 5's conditional rendering.
  - "Everything else on the page is the same component" → Task 5 reuses `PonchadorDashboard` unmodified; `PonchadorDashboard.tsx`/`PeriodFilter.tsx` appear in no task's file list.
  - "Motivational box hidden when viewing someone else" → Task 5's `if (isViewingSelf)` guard around computing `motivationalPhrase`, left `null` otherwise, which `PonchadorDashboard` already renders conditionally.
  - "Unified data path (self routes through the same functions as team/all)" → Task 5 calls `get_ponchador_contact_summary`/`get_ponchador_punches`/`get_ponchador_approved_leave` unconditionally for every scope, with no separate self-only branch for data fetching.
  - Testing section → Task 2's 8 tests cover every listed scenario (self, direct report, two-level chain, outsider-rejected, can_manage-allowed, team listing, all-listing-empty, all-listing-populated).
  - Out of scope items (export, editing others' punches, notifications) → no task implements any of them, confirming they were correctly left out.
- **Placeholder scan:** none found — every step has complete, concrete code.
- **Type consistency:** `PonchadorPersonOption { id, name, departmentName? }` is defined once in Task 4 and imported (not redefined) in Task 5. `PonchadorScope = "self" | "team" | "all"` is defined once in Task 3 and imported in Task 5. `PonchadorRow`/`PonchadorSummary`/`DayEstado` are the existing Phase 1 types from `PonchadorDashboard.tsx`/`attendance.ts` — Task 5 imports and reuses them unchanged, never redeclares them. The SQL functions' return column names (`first_name`, `last_name`, `schedule_id`, `department_id`, `hikvision_employee_no`, `punched_at`, `date_from`, `date_to`, `id`, `position`, `department_name`) match exactly what Task 5's `.rpc(...)` callers destructure.
