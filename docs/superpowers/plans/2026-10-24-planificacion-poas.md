# Planificación — POAs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the POAs half of the new "Planificación" module — a company-wide KPI/goal-tracking system (one annual POA per person, built from a reusable per-puesto KPI template, with department-scoped leader supervision) — as a standalone, working feature. The Tareas tab is a separate, later spec/plan.

**Architecture:** A new Supabase module (`planificacion`) following this codebase's established per-module conventions exactly (role_profile_permissions-gated pages, RLS-first enforcement, admin-client server actions, `"use server"` action files per screen). One new wrinkle, called out explicitly at each task that touches it: **leader supervision is scoped per-person to specific departments via a new junction table (`planificacion_department_leaders`), not via role profiles** — every other module in this codebase gates purely by role profile, so this is the first per-user permission scope. Compliance/rollup views (week/month/quarter/year) are computed client-side in TypeScript from a plain list of dated progress entries, the same "fetch everything small, filter client-side" pattern already used for Suministros' Tablero and Servicios Generales' Workspace.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres + RLS), Bun (no node.exe on this machine — every command below uses `bun`/`bunx`), Tailwind, shadcn-style UI components already in `src/components/ui/`.

**Testing approach for this plan:** The three most recent modules built in this codebase (GoServices enhancements, Suministros, Servicios Generales) shipped without new automated tests — verification was `bunx tsc --noEmit` + `bunx eslint` + `bun run build` + manual testing in the browser, each module's own migration run by the user in the Supabase SQL Editor. This plan follows that same, currently-live precedent rather than introducing TDD for just this module. Do not run the full `bun test` suite (project convention this session).

**Environment constraints (do not skip):**
- No `node`/`npm`/`npx` on this machine. Always `bun run <script>`, `bunx <tool>`.
- The Supabase CLI and Management API credentials on this machine are currently invalid — migrations **cannot** be applied by running a command. Every migration task ends with a **STOP**: hand the exact `.sql` file content to the user, and do not proceed to a task that queries the new table/column until the user confirms they ran it.
- Work happens directly on `main` in `c:\Users\gcordero\Documents\GitHub\GenteBusiness` (no worktree) — this matches how every module today was built in this same session.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, written to a temp file and committed with `git commit -F <file>` (this session's established reliable pattern — a `git commit -m` with an embedded multi-line PowerShell here-string has repeatedly misbehaved).
- Never run `bunx vercel --prod` without first asking the user "¿despliego a producción?" and getting an explicit yes — this is enforced by an auto-mode permission classifier and is also just the right thing to do.

---

## File Structure

```
supabase/migrations/
  20261024220000_planificacion_module.sql                  (Task 1)
  20261024220100_planificacion_leaders_and_positions.sql    (Task 2)
  20261024220200_poas.sql                                   (Task 3)

src/app/(app)/planificacion/
  actions.ts                      (Task 4 — shared: callerFlags, getMyContact, getMyPoa, getPoaForContact, logObjectiveUpdate)
  ComplianceView.tsx               (Task 7 — client: period filter + rollup table/chart, shared by Mi POA and Mi equipo drill-in)
  ExportButton.tsx                 (Task 9)
  poas/
    page.tsx                       (Task 7 — "Mi POA")
    LogUpdateDialog.tsx             (Task 7)
  equipo/
    actions.ts                     (Task 6 — roster + assign/edit POA for someone else)
    page.tsx                       (Task 8 — "Mi equipo")
    AssignPoaDialog.tsx             (Task 8)
  puestos/
    actions.ts                     (Task 5 — puesto/KPI-template CRUD)
    page.tsx                       (Task 5 — "Puestos")
    PositionFormDialog.tsx          (Task 5)
    PositionsTable.tsx              (Task 5)
  lideres/
    actions.ts                     (Task 2b — department-leader assignment CRUD, Consejo-only)
    page.tsx                       (Task 2b)
    LeaderFormDialog.tsx            (Task 2b)

src/app/(app)/Sidebar.tsx          (modify — Task 10)
src/app/(app)/layout.tsx           (modify — Task 10)
```

Each screen's actions live next to it (matching Servicios Generales' `activos/actions.ts`, `proveedores/actions.ts` convention) except the shared root `actions.ts`, which every sub-screen imports from for `callerFlags`/`getMyContact`/`getPoaForContact`.

---

### Task 1: Register the `planificacion` module

**Files:**
- Create: `supabase/migrations/20261024220000_planificacion_module.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Registers the new "Planificación" module (POAs tab first; Tareas tab
-- ships later under the same module_key). can_view is a real, grantable
-- permission like every other module in this app - NOT hardcoded open to
-- everyone - per the user's explicit, repeated instruction earlier this
-- session that nothing should be visible without an explicit grant in
-- Perfiles de rol (the Suministros/Servicios Generales/GoServices
-- visibility fixes). Granted by default only to 'Super Admin' and the
-- existing 'Consejo' role profile (confirmed with the user: Consejo gets
-- company-wide POA authority, reusing that existing role rather than
-- inventing a new concept).
--   can_view      = see and log progress on your OWN POA.
--   can_manage    = "líder": see/assign POAs for whichever department(s)
--                   this specific person is assigned to supervise (see
--                   planificacion_department_leaders, next migration) -
--                   NOT granted company-wide just by holding this flag.
--   can_authorize = "Consejo": company-wide - every department, plus
--                   manages the puesto/KPI-template catalog.
insert into public.modules (key, label) values ('planificacion', 'Planificación');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select
  rp.id,
  m.id,
  (rp.name = 'Super Admin' or rp.name = 'Consejo'),
  false,
  false,
  false,
  false,
  (rp.name = 'Super Admin'),
  (rp.name = 'Super Admin' or rp.name = 'Consejo')
from public.role_profiles rp
cross join public.modules m
where m.key = 'planificacion';
```

- [ ] **Step 2: STOP — hand this file to the user**

Say: "Necesito que corras esta migración en el SQL Editor de Supabase antes de seguir: `supabase/migrations/20261024220000_planificacion_module.sql`." Paste the file's contents. Wait for explicit confirmation it ran successfully before starting Task 2.

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261024220000_planificacion_module.sql"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-module.txt"
```

(Write the commit message to that temp file first, ending with the `Co-Authored-By` line, per this session's established pattern.)

---

### Task 2: Department-leader assignments + puesto/KPI-template catalog

**Files:**
- Create: `supabase/migrations/20261024220100_planificacion_leaders_and_positions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Which departments a given can_manage user ("líder") is allowed to
-- supervise - per-person, not per-role-profile. New pattern for this
-- codebase: every other module's permissions are role-profile-only.
-- Confirmed with the user ("un líder puede tener varios departamentos" -
-- two people sharing a role profile like "Gerente" can lead different
-- departments, so the role profile alone can't encode this).
create table public.planificacion_department_leaders (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (app_user_id, department_id)
);

alter table public.planificacion_department_leaders enable row level security;

create policy "planificacion_department_leaders_select" on public.planificacion_department_leaders
  for select
  using (
    app_user_id = auth.uid()
    or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
  );

create policy "planificacion_department_leaders_write" on public.planificacion_department_leaders
  for all
  using (coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false))
  with check (coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false));

-- The reusable KPI template per puesto - one catalog for the whole
-- company (not per-department), editable only by Consejo/RRHH
-- (can_authorize). A leader reads this to start a person's POA from a
-- template, then can adjust/add objectives for that specific person/year.
create table public.poa_positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

alter table public.poa_positions enable row level security;

create policy "poa_positions_select" on public.poa_positions
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('planificacion')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
    or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
  );

create policy "poa_positions_write" on public.poa_positions
  for all
  using (coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false))
  with check (coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false));

create table public.poa_position_objectives (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.poa_positions(id) on delete cascade,
  title text not null,
  kpi_metric text not null,
  suggested_target numeric,
  unit text,
  sort_order integer not null default 0
);

alter table public.poa_position_objectives enable row level security;

create policy "poa_position_objectives_select" on public.poa_position_objectives
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('planificacion')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
    or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
  );

create policy "poa_position_objectives_write" on public.poa_position_objectives
  for all
  using (coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false))
  with check (coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false));

-- Formal link from a contact to the puesto catalog. Additive to the
-- existing free-text contacts.position (unchanged, still used everywhere
-- else in the app for display) - only used to pick which template a
-- leader starts from when assigning a POA.
alter table public.contacts
  add column poa_position_id uuid references public.poa_positions(id);
```

- [ ] **Step 2: STOP — hand this file to the user**

Say: "Siguiente migración: `supabase/migrations/20261024220100_planificacion_leaders_and_positions.sql`." Paste the contents. Wait for confirmation.

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261024220100_planificacion_leaders_and_positions.sql"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-leaders-positions.txt"
```

---

### Task 3: POAs, objectives, and the progress log

**Files:**
- Create: `supabase/migrations/20261024220200_poas.sql`

- [ ] **Step 1: Write the migration**

```sql
-- One POA per person per year.
create table public.poas (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id),
  department_id uuid not null references public.departments(id), -- snapshot at assignment time
  position_id uuid references public.poa_positions(id),           -- template used, if any
  period_year integer not null,
  status text not null default 'activo' check (status in ('activo', 'cerrado')),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (contact_id, period_year)
);

create table public.poa_objectives (
  id uuid primary key default gen_random_uuid(),
  poa_id uuid not null references public.poas(id) on delete cascade,
  title text not null,
  kpi_metric text not null,
  target_value numeric not null,
  unit text,
  notes text,
  sort_order integer not null default 0
);

-- Dated progress log - entered whenever ("según se va actualizando"), not
-- on a fixed schedule. Compliance views roll these up by week/month/
-- quarter/year against the objective's single target_value, computed
-- client-side from the full list (same pattern as Suministros' Tablero).
create table public.poa_objective_updates (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.poa_objectives(id) on delete cascade,
  value numeric not null,
  recorded_at date not null default current_date,
  recorded_by uuid not null references public.app_users(id),
  note text,
  created_at timestamptz not null default now()
);

alter table public.poas enable row level security;
alter table public.poa_objectives enable row level security;
alter table public.poa_objective_updates enable row level security;

create policy "poas_select" on public.poas
  for select
  using (
    contact_id in (select id from public.contacts where email = (select email from public.app_users where id = auth.uid()))
    or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
    or (
      coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
      and department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
    )
  );

create policy "poas_write" on public.poas
  for all
  using (
    coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
    or (
      coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
      and department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
    )
  )
  with check (
    coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
    or (
      coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
      and department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
    )
  );

create policy "poa_objectives_select" on public.poa_objectives
  for select
  using (
    exists (
      select 1 from public.poas p
      where p.id = poa_id
        and (
          p.contact_id in (select id from public.contacts where email = (select email from public.app_users where id = auth.uid()))
          or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
          or (
            coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
            and p.department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
          )
        )
    )
  );

create policy "poa_objectives_write" on public.poa_objectives
  for all
  using (
    exists (
      select 1 from public.poas p
      where p.id = poa_id
        and (
          coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
          or (
            coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
            and p.department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.poas p
      where p.id = poa_id
        and (
          coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
          or (
            coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
            and p.department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
          )
        )
    )
  );

create policy "poa_objective_updates_select" on public.poa_objective_updates
  for select
  using (
    exists (
      select 1 from public.poa_objectives o
      join public.poas p on p.id = o.poa_id
      where o.id = objective_id
        and (
          p.contact_id in (select id from public.contacts where email = (select email from public.app_users where id = auth.uid()))
          or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
          or (
            coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
            and p.department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
          )
        )
    )
  );

-- Insert-only (no update/delete policy) - a progress entry is an
-- append-only log entry, same spirit as a comment thread elsewhere in
-- this app. The person logging it can be the POA's own owner, their
-- leader, or Consejo.
create policy "poa_objective_updates_insert" on public.poa_objective_updates
  for insert
  with check (
    exists (
      select 1 from public.poa_objectives o
      join public.poas p on p.id = o.poa_id
      where o.id = objective_id
        and (
          p.contact_id in (select id from public.contacts where email = (select email from public.app_users where id = auth.uid()))
          or coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
          or (
            coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
            and p.department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
          )
        )
    )
  );
```

- [ ] **Step 2: STOP — hand this file to the user**

Say: "Última migración de esta entrega: `supabase/migrations/20261024220200_poas.sql`." Paste the contents. Wait for confirmation before Task 4.

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261024220200_poas.sql"
git commit -F "$env:TEMP\claude\commit-msg-poas-tables.txt"
```

---

### Task 4: Shared actions (`src/app/(app)/planificacion/actions.ts`)

**Files:**
- Create: `src/app/(app)/planificacion/actions.ts`

- [ ] **Step 1: Write the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ActionResult {
  error?: string;
}

export interface CallerFlags {
  canView: boolean;
  canManage: boolean;
  canAuthorize: boolean;
}

export async function callerFlags(): Promise<CallerFlags> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  return {
    canView: Boolean(data?.[0]?.can_view),
    canManage: Boolean(data?.[0]?.can_manage),
    canAuthorize: Boolean(data?.[0]?.can_authorize),
  };
}

export interface MyContactInfo {
  contactId: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
}

export async function getMyContact(): Promise<MyContactInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, department_id, departments(name), poa_position_id")
    .eq("email", user.email)
    .maybeSingle();
  if (!contact) return null;

  const dept = Array.isArray(contact.departments) ? contact.departments[0] : contact.departments;
  return {
    contactId: contact.id,
    name: `${contact.first_name} ${contact.last_name}`,
    departmentId: contact.department_id,
    departmentName: dept?.name ?? null,
    positionId: contact.poa_position_id,
  };
}

export interface PoaObjectiveUpdateRow {
  id: string;
  value: number;
  recordedAt: string;
  note: string | null;
}

export interface PoaObjectiveRow {
  id: string;
  title: string;
  kpiMetric: string;
  targetValue: number;
  unit: string | null;
  notes: string | null;
  updates: PoaObjectiveUpdateRow[];
}

export interface PoaRow {
  id: string;
  contactId: string;
  contactName: string;
  departmentId: string;
  departmentName: string | null;
  positionId: string | null;
  positionName: string | null;
  periodYear: number;
  status: "activo" | "cerrado";
  objectives: PoaObjectiveRow[];
}

// Shared by "Mi POA" (own contact) and "Mi equipo" (drilling into someone
// else's POA) - exported so equipo/actions.ts and equipo/page.tsx can
// reuse it instead of duplicating the join/shape logic.
export async function getPoaForContact(contactId: string, periodYear: number): Promise<PoaRow | null> {
  const admin = createAdminClient();
  const { data: poa } = await admin
    .from("poas")
    .select(
      "id, contact_id, department_id, departments(name), position_id, poa_positions(name), period_year, status, contacts(first_name, last_name)",
    )
    .eq("contact_id", contactId)
    .eq("period_year", periodYear)
    .maybeSingle();
  if (!poa) return null;

  const { data: objectives } = await admin
    .from("poa_objectives")
    .select("id, title, kpi_metric, target_value, unit, notes, sort_order")
    .eq("poa_id", poa.id)
    .order("sort_order");

  const objectiveIds = (objectives ?? []).map((o) => o.id);
  const { data: updates } = objectiveIds.length
    ? await admin
        .from("poa_objective_updates")
        .select("id, objective_id, value, recorded_at, note")
        .in("objective_id", objectiveIds)
        .order("recorded_at", { ascending: true })
    : { data: [] as { id: string; objective_id: string; value: number; recorded_at: string; note: string | null }[] };

  const dept = Array.isArray(poa.departments) ? poa.departments[0] : poa.departments;
  const position = Array.isArray(poa.poa_positions) ? poa.poa_positions[0] : poa.poa_positions;
  const contact = Array.isArray(poa.contacts) ? poa.contacts[0] : poa.contacts;

  return {
    id: poa.id,
    contactId: poa.contact_id,
    contactName: contact ? `${contact.first_name} ${contact.last_name}` : "",
    departmentId: poa.department_id,
    departmentName: dept?.name ?? null,
    positionId: poa.position_id,
    positionName: position?.name ?? null,
    periodYear: poa.period_year,
    status: poa.status as "activo" | "cerrado",
    objectives: (objectives ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      kpiMetric: o.kpi_metric,
      targetValue: o.target_value,
      unit: o.unit,
      notes: o.notes,
      updates: (updates ?? [])
        .filter((u) => u.objective_id === o.id)
        .map((u) => ({ id: u.id, value: u.value, recordedAt: u.recorded_at, note: u.note })),
    })),
  };
}

export async function getMyPoa(periodYear: number): Promise<PoaRow | null> {
  const me = await getMyContact();
  if (!me) return null;
  return getPoaForContact(me.contactId, periodYear);
}

export async function logObjectiveUpdate(objectiveId: string, value: number, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (Number.isNaN(value)) return { error: "El valor debe ser un número" };

  const { error } = await supabase.from("poa_objective_updates").insert({
    objective_id: objectiveId,
    value,
    recorded_by: user.id,
    note: note.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/planificacion/poas");
  revalidatePath("/planificacion/equipo");
  return {};
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors referencing `src/app/(app)/planificacion/actions.ts` (other modules' pre-existing errors, if any, are out of scope — there should be none).

- [ ] **Step 3: Commit**

```powershell
git add "src/app/(app)/planificacion/actions.ts"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-shared-actions.txt"
```

---

### Task 5: Puesto/KPI-template catalog (`/planificacion/puestos`)

**Files:**
- Create: `src/app/(app)/planificacion/puestos/actions.ts`
- Create: `src/app/(app)/planificacion/puestos/page.tsx`
- Create: `src/app/(app)/planificacion/puestos/PositionFormDialog.tsx`
- Create: `src/app/(app)/planificacion/puestos/PositionsTable.tsx`

**Scope note:** v1 supports creating a puesto with its objective list in one step, and activating/deactivating a puesto. Editing an existing puesto's objective list in place is deliberately out of scope for this first cut (deactivate and create a corrected version is the workaround) — flag this to the user as a known v1 limitation, not a bug.

- [ ] **Step 1: Write `puestos/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerFlags } from "../actions";

interface ActionResult {
  error?: string;
}

export interface PositionObjectiveInput {
  title: string;
  kpiMetric: string;
  suggestedTarget: number | null;
  unit: string;
}

export interface PositionRow {
  id: string;
  name: string;
  status: "activo" | "inactivo";
  objectives: (PositionObjectiveInput & { id: string })[];
}

export async function listPositions(): Promise<PositionRow[]> {
  const admin = createAdminClient();
  const { data: positions } = await admin.from("poa_positions").select("id, name, status").order("name");
  const rows = positions ?? [];
  const ids = rows.map((p) => p.id);
  const { data: objectives } = ids.length
    ? await admin
        .from("poa_position_objectives")
        .select("id, position_id, title, kpi_metric, suggested_target, unit, sort_order")
        .in("position_id", ids)
        .order("sort_order")
    : { data: [] as { id: string; position_id: string; title: string; kpi_metric: string; suggested_target: number | null; unit: string | null }[] };

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as "activo" | "inactivo",
    objectives: (objectives ?? [])
      .filter((o) => o.position_id === p.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        kpiMetric: o.kpi_metric,
        suggestedTarget: o.suggested_target,
        unit: o.unit ?? "",
      })),
  }));
}

export async function createPosition(name: string, objectives: PositionObjectiveInput[]): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };
  if (!name.trim()) return { error: "El nombre es obligatorio" };
  if (objectives.length === 0) return { error: "Agrega al menos un objetivo/KPI" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: position, error } = await admin
    .from("poa_positions")
    .insert({ name: name.trim(), created_by: user.id })
    .select("id")
    .single();
  if (error || !position) return { error: error?.message ?? "No se pudo crear el puesto" };

  const { error: objError } = await admin.from("poa_position_objectives").insert(
    objectives.map((o, i) => ({
      position_id: position.id,
      title: o.title,
      kpi_metric: o.kpiMetric,
      suggested_target: o.suggestedTarget,
      unit: o.unit || null,
      sort_order: i,
    })),
  );
  if (objError) return { error: objError.message };

  revalidatePath("/planificacion/puestos");
  return {};
}

export async function setPositionStatus(id: string, status: "activo" | "inactivo"): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("poa_positions").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/planificacion/puestos");
  return {};
}
```

- [ ] **Step 2: Write `puestos/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listPositions } from "./actions";
import { PositionFormDialog } from "./PositionFormDialog";
import { PositionsTable } from "./PositionsTable";

export default async function PlanificacionPuestosPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  if (!flagsRows?.[0]?.can_authorize) {
    redirect("/");
  }

  const positions = await listPositions();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Puestos y KPIs</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo único de puestos con su plantilla de objetivos/KPIs, para toda la empresa.
            </p>
          </div>
          <PositionFormDialog />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <PositionsTable positions={positions} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `puestos/PositionFormDialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPosition, type PositionObjectiveInput } from "./actions";

const EMPTY_OBJECTIVE: PositionObjectiveInput = { title: "", kpiMetric: "", suggestedTarget: null, unit: "" };

export function PositionFormDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objectives, setObjectives] = useState<PositionObjectiveInput[]>([{ ...EMPTY_OBJECTIVE }]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setObjectives([{ ...EMPTY_OBJECTIVE }]);
    setError(null);
  }

  function updateObjective(index: number, patch: Partial<PositionObjectiveInput>) {
    setObjectives((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function submit() {
    setError(null);
    const cleanObjectives = objectives.filter((o) => o.title.trim() && o.kpiMetric.trim());
    startTransition(async () => {
      const result = await createPosition(name, cleanObjectives);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Nuevo puesto
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo puesto</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Nombre del puesto</label>
            <Input placeholder="Ej. Contador" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Objetivos/KPIs del puesto</p>
            {objectives.map((o, i) => (
              <div key={i} className="space-y-2 rounded-xl border p-3">
                <Input
                  placeholder="Título del objetivo"
                  value={o.title}
                  onChange={(e) => updateObjective(i, { title: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Métrica (ej. Ventas)"
                    value={o.kpiMetric}
                    onChange={(e) => updateObjective(i, { kpiMetric: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Meta sugerida"
                    value={o.suggestedTarget ?? ""}
                    onChange={(e) =>
                      updateObjective(i, { suggestedTarget: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                  <Input
                    placeholder="Unidad (%, RD$...)"
                    value={o.unit}
                    onChange={(e) => updateObjective(i, { unit: e.target.value })}
                  />
                </div>
                {objectives.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-red-600"
                    onClick={() => setObjectives((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5" />
                    Quitar
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setObjectives((prev) => [...prev, { ...EMPTY_OBJECTIVE }])}
            >
              <Plus className="size-3.5" />
              Agregar objetivo
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar puesto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write `puestos/PositionsTable.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setPositionStatus, type PositionRow } from "./actions";

export function PositionsTable({ positions }: { positions: PositionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleStatus(p: PositionRow) {
    startTransition(async () => {
      await setPositionStatus(p.id, p.status === "activo" ? "inactivo" : "activo");
      router.refresh();
    });
  }

  if (positions.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no has creado ningún puesto.</p>;
  }

  return (
    <div className="space-y-3">
      {positions.map((p) => (
        <div key={p.id} className={`rounded-xl border p-3 ${p.status === "inactivo" ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-foreground">{p.name}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => toggleStatus(p)}
              className={p.status === "activo" ? "text-red-600" : "text-emerald-700"}
            >
              {p.status === "activo" ? "Desactivar" : "Activar"}
            </Button>
          </div>
          <div className="mt-2 space-y-1">
            {p.objectives.map((o) => (
              <p key={o.id} className="text-xs text-muted-foreground">
                {o.title} · {o.kpiMetric}
                {o.suggestedTarget != null ? ` · Meta sugerida: ${o.suggestedTarget}${o.unit ? ` ${o.unit}` : ""}` : ""}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, lint**

Run: `bunx tsc --noEmit`
Run: `bunx eslint "src/app/(app)/planificacion/puestos/actions.ts" "src/app/(app)/planificacion/puestos/page.tsx" "src/app/(app)/planificacion/puestos/PositionFormDialog.tsx" "src/app/(app)/planificacion/puestos/PositionsTable.tsx"`
Expected: both clean.

- [ ] **Step 6: Commit**

```powershell
git add "src/app/(app)/planificacion/puestos"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-puestos.txt"
```

---

### Task 2b: Department-leader admin screen (`/planificacion/lideres`)

Placed here in the file structure (not a separate numbered migration task) because it depends on Task 2's `planificacion_department_leaders` table but is independent of Tasks 4-5 — build it any time after Task 2's migration is confirmed. This screen wasn't spelled out in the design spec as its own page; a small dedicated page (same pattern as Activos/Proveedores being their own focused pages rather than bolted onto another screen) is the minimal reasonable placement, gated Consejo-only (`can_authorize`) since only Consejo can decide who leads which department.

**Files:**
- Create: `src/app/(app)/planificacion/lideres/actions.ts`
- Create: `src/app/(app)/planificacion/lideres/page.tsx`
- Create: `src/app/(app)/planificacion/lideres/LeaderFormDialog.tsx`

- [ ] **Step 1: Write `lideres/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerFlags } from "../actions";

interface ActionResult {
  error?: string;
}

export interface DepartmentLeaderRow {
  id: string;
  appUserId: string;
  userName: string;
  departmentId: string;
  departmentName: string;
}

// general_maintenance_assets hit this same issue earlier today: a table
// with more than one FK into app_users makes an embedded join ambiguous.
// This table only has one (app_user_id), but resolving a real NAME still
// needs the same two-step lookup used everywhere else in this codebase
// (app_users.full_name is rarely populated - resolve via the matching
// contacts row by email instead).
async function buildUserNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").in("id", userIds);
  if (!users || users.length === 0) return new Map();
  const emails = users.map((u) => u.email);
  const { data: contacts } = await admin.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));
  return new Map(users.map((u) => [u.id, nameByEmail.get(u.email) ?? u.email]));
}

export async function listDepartmentLeaders(): Promise<DepartmentLeaderRow[]> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("planificacion_department_leaders")
    .select("id, app_user_id, department_id, departments(name)")
    .order("department_id");
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap([...new Set(rows.map((r) => r.app_user_id))]);

  return rows.map((r) => {
    const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
    return {
      id: r.id,
      appUserId: r.app_user_id,
      userName: nameByUserId.get(r.app_user_id) ?? r.app_user_id,
      departmentId: r.department_id,
      departmentName: dept?.name ?? "",
    };
  });
}

export interface AssignableAppUser {
  id: string;
  name: string;
}

export async function listAssignableAppUsers(): Promise<AssignableAppUser[]> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return [];

  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").eq("status", "active").order("email");
  if (!users || users.length === 0) return [];
  const nameByUserId = await buildUserNameMap(users.map((u) => u.id));
  return users.map((u) => ({ id: u.id, name: nameByUserId.get(u.id) ?? u.id }));
}

export async function addDepartmentLeader(appUserId: string, departmentId: string): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("planificacion_department_leaders")
    .insert({ app_user_id: appUserId, department_id: departmentId, created_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/planificacion/lideres");
  return {};
}

export async function removeDepartmentLeader(id: string): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("planificacion_department_leaders").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/planificacion/lideres");
  return {};
}
```

- [ ] **Step 2: Write `lideres/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listDepartmentLeaders, listAssignableAppUsers } from "./actions";
import { LeaderFormDialog } from "./LeaderFormDialog";

export default async function PlanificacionLideresPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  if (!flagsRows?.[0]?.can_authorize) {
    redirect("/");
  }

  const [leaders, users, { data: departments }] = await Promise.all([
    listDepartmentLeaders(),
    listAssignableAppUsers(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Líderes por departamento</h1>
            <p className="text-sm text-muted-foreground">
              Quién puede supervisar los POAs de cada departamento.
            </p>
          </div>
          <LeaderFormDialog users={users} departments={departments ?? []} />
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {leaders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Todavía no has asignado ningún líder de departamento.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Persona</th>
                  <th className="pb-2 pr-3 font-medium">Departamento</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {leaders.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{l.userName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{l.departmentName}</td>
                    <td className="py-2 text-right">
                      <RemoveLeaderButton id={l.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Inline client component, kept in this file since it's a single button
// with no other state - matches this codebase's convention of not
// splitting out a file for a one-liner (see similar inline patterns in
// other admin tables).
import { RemoveLeaderButton } from "./LeaderFormDialog";
```

Note on Step 2: Next.js requires imports at the top of the file; move the `import { RemoveLeaderButton } from "./LeaderFormDialog";` line up to the top of the file alongside the other imports before running anything — it's written at the bottom above only to call out that `RemoveLeaderButton` is defined in the next step's file, not to signal where the import statement physically belongs.

- [ ] **Step 3: Write `lideres/LeaderFormDialog.tsx`** (includes both the "add" dialog and the small `RemoveLeaderButton` used by `page.tsx`)

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDepartmentLeader, removeDepartmentLeader, type AssignableAppUser } from "./actions";

export function LeaderFormDialog({
  users,
  departments,
}: {
  users: AssignableAppUser[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [appUserId, setAppUserId] = useState(users[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addDepartmentLeader(appUserId, departmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Asignar líder
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar líder de departamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Persona</label>
            <Select value={appUserId} onValueChange={(v) => v && setAppUserId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => users.find((u) => u.id === appUserId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Departamento</label>
            <Select value={departmentId} onValueChange={(v) => v && setDepartmentId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => departments.find((d) => d.id === departmentId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveLeaderButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      await removeDepartmentLeader(id);
      router.refresh();
    });
  }

  return (
    <Button size="icon-sm" variant="outline" disabled={isPending} onClick={remove} className="text-red-600">
      <X className="size-3.5" />
    </Button>
  );
}
```

- [ ] **Step 4: Fix the import placement in `lideres/page.tsx`**

Move `import { LeaderFormDialog, RemoveLeaderButton } from "./LeaderFormDialog";` to the top of `page.tsx` (replacing the separate `LeaderFormDialog` import and the stray bottom import from Step 2) so the file reads:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listDepartmentLeaders, listAssignableAppUsers } from "./actions";
import { LeaderFormDialog, RemoveLeaderButton } from "./LeaderFormDialog";

export default async function PlanificacionLideresPage() {
  // ...unchanged body from Step 2, minus the bottom import line...
```

- [ ] **Step 5: Typecheck, lint**

Run: `bunx tsc --noEmit`
Run: `bunx eslint "src/app/(app)/planificacion/lideres/actions.ts" "src/app/(app)/planificacion/lideres/page.tsx" "src/app/(app)/planificacion/lideres/LeaderFormDialog.tsx"`
Expected: both clean.

- [ ] **Step 6: Commit**

```powershell
git add "src/app/(app)/planificacion/lideres"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-lideres.txt"
```

---

### Task 6: "Mi equipo" actions (`src/app/(app)/planificacion/equipo/actions.ts`)

**Files:**
- Create: `src/app/(app)/planificacion/equipo/actions.ts`

- [ ] **Step 1: Write the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerFlags } from "../actions";

interface ActionResult {
  error?: string;
}

export interface SupervisedContactRow {
  contactId: string;
  name: string;
  departmentId: string;
  departmentName: string | null;
  positionId: string | null;
  positionName: string | null;
  hasPoaForYear: boolean;
}

async function mySupervisedDepartmentIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("planificacion_department_leaders")
    .select("department_id")
    .eq("app_user_id", user.id);
  return (data ?? []).map((r) => r.department_id);
}

export async function listSupervisedContacts(periodYear: number): Promise<SupervisedContactRow[]> {
  const flags = await callerFlags();
  if (!flags.canManage && !flags.canAuthorize) return [];

  const admin = createAdminClient();
  let query = admin
    .from("contacts")
    .select("id, first_name, last_name, department_id, departments(name), poa_position_id, poa_positions(name)")
    .eq("status", "active")
    .order("first_name");

  if (!flags.canAuthorize) {
    const departmentIds = await mySupervisedDepartmentIds();
    if (departmentIds.length === 0) return [];
    query = query.in("department_id", departmentIds);
  }

  const { data: contacts } = await query;
  const rows = contacts ?? [];
  const contactIds = rows.map((c) => c.id);
  const { data: existingPoas } = contactIds.length
    ? await admin.from("poas").select("contact_id").eq("period_year", periodYear).in("contact_id", contactIds)
    : { data: [] as { contact_id: string }[] };
  const withPoa = new Set((existingPoas ?? []).map((p) => p.contact_id));

  return rows.map((c) => {
    const dept = Array.isArray(c.departments) ? c.departments[0] : c.departments;
    const position = Array.isArray(c.poa_positions) ? c.poa_positions[0] : c.poa_positions;
    return {
      contactId: c.id,
      name: `${c.first_name} ${c.last_name}`,
      departmentId: c.department_id,
      departmentName: dept?.name ?? null,
      positionId: c.poa_position_id,
      positionName: position?.name ?? null,
      hasPoaForYear: withPoa.has(c.id),
    };
  });
}

export interface PositionObjectiveOption {
  title: string;
  kpiMetric: string;
  targetValue: number;
  unit: string;
}

export async function getPositionTemplate(positionId: string): Promise<PositionObjectiveOption[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("poa_position_objectives")
    .select("title, kpi_metric, suggested_target, unit")
    .eq("position_id", positionId)
    .order("sort_order");
  return (data ?? []).map((o) => ({
    title: o.title,
    kpiMetric: o.kpi_metric,
    targetValue: o.suggested_target ?? 0,
    unit: o.unit ?? "",
  }));
}

export interface ListPositionsOption {
  id: string;
  name: string;
}

export async function listActivePositionOptions(): Promise<ListPositionsOption[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("poa_positions").select("id, name").eq("status", "activo").order("name");
  return data ?? [];
}

export interface AssignPoaInput {
  contactId: string;
  departmentId: string;
  positionId: string | null;
  periodYear: number;
  objectives: { title: string; kpiMetric: string; targetValue: number; unit: string }[];
}

export async function assignPoa(input: AssignPoaInput): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canManage && !flags.canAuthorize) return { error: "No autorizado" };
  if (input.objectives.length === 0) return { error: "Agrega al menos un objetivo" };

  if (!flags.canAuthorize) {
    const departmentIds = await mySupervisedDepartmentIds();
    if (!departmentIds.includes(input.departmentId)) return { error: "No autorizado para este departamento" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: poa, error } = await admin
    .from("poas")
    .insert({
      contact_id: input.contactId,
      department_id: input.departmentId,
      position_id: input.positionId,
      period_year: input.periodYear,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !poa) return { error: error?.message ?? "No se pudo crear el POA" };

  const { error: objError } = await admin.from("poa_objectives").insert(
    input.objectives.map((o, i) => ({
      poa_id: poa.id,
      title: o.title,
      kpi_metric: o.kpiMetric,
      target_value: o.targetValue,
      unit: o.unit || null,
      sort_order: i,
    })),
  );
  if (objError) return { error: objError.message };

  revalidatePath("/planificacion/equipo");
  return {};
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```powershell
git add "src/app/(app)/planificacion/equipo/actions.ts"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-equipo-actions.txt"
```

---

### Task 7: "Mi POA" screen + compliance view

**Files:**
- Create: `src/app/(app)/planificacion/ComplianceView.tsx`
- Create: `src/app/(app)/planificacion/poas/page.tsx`
- Create: `src/app/(app)/planificacion/poas/LogUpdateDialog.tsx`

- [ ] **Step 1: Write `ComplianceView.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import type { PoaObjectiveRow } from "./actions";

type Granularity = "semana" | "mes" | "trimestre" | "año";

const GRANULARITY_OPTIONS: { key: Granularity; label: string }[] = [
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "año", label: "Año" },
];

// Groups an objective's dated progress entries into buckets (ISO week,
// "YYYY-MM", "YYYY-Qn", or "YYYY") and reports the latest value in each
// bucket plus the % of target it represents - computed client-side from
// the full update list, same "fetch everything small, compute in the
// browser" pattern as Suministros' Tablero and Servicios Generales'
// Workspace, since this is an internal tool with modest data volume.
function bucketKey(dateIso: string, granularity: Granularity): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const year = d.getUTCFullYear();
  if (granularity === "año") return String(year);
  if (granularity === "trimestre") return `${year}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (granularity === "mes") return `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  // ISO week number
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${tmp.getUTCFullYear()}-S${String(week).padStart(2, "0")}`;
}

export function ComplianceView({ objective }: { objective: PoaObjectiveRow }) {
  const [granularity, setGranularity] = useState<Granularity>("mes");

  const buckets = useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const u of objective.updates) {
      byBucket.set(bucketKey(u.recordedAt, granularity), u.value); // last write per bucket wins (updates are sorted ascending by recordedAt)
    }
    return [...byBucket.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [objective.updates, granularity]);

  const latestValue = objective.updates.at(-1)?.value ?? null;
  const percent = latestValue != null && objective.targetValue > 0 ? Math.round((latestValue / objective.targetValue) * 100) : null;

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{objective.title}</p>
          <p className="text-xs text-muted-foreground">
            {objective.kpiMetric} · Meta: {objective.targetValue}
            {objective.unit ? ` ${objective.unit}` : ""}
          </p>
        </div>
        {percent != null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              percent >= 100 ? "bg-emerald-50 text-emerald-700" : percent >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
            }`}
          >
            {percent}% de cumplimiento
          </span>
        )}
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
        {GRANULARITY_OPTIONS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGranularity(g.key)}
            className={`flex-1 rounded-md px-2 py-1 font-semibold ${
              granularity === g.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {buckets.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Todavía no hay avances registrados.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Periodo</th>
              <th className="pb-1 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(([bucket, value]) => (
              <tr key={bucket} className="border-b last:border-0">
                <td className="py-1 pr-2 text-foreground">{bucket}</td>
                <td className="py-1 text-muted-foreground">
                  {value}
                  {objective.unit ? ` ${objective.unit}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `poas/LogUpdateDialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { logObjectiveUpdate } from "../actions";

export function LogUpdateDialog({ objectiveId, objectiveTitle }: { objectiveId: string; objectiveTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await logObjectiveUpdate(objectiveId, Number(value), note);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setValue("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <Plus className="size-3.5" />
        Registrar avance
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar avance — {objectiveTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Valor actual</label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Nota (opcional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !value} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `poas/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyPoa } from "../actions";
import { ComplianceView } from "../ComplianceView";
import { LogUpdateDialog } from "./LogUpdateDialog";

export default async function MiPoaPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  const flags = flagsRows?.[0];
  if (!flags?.can_view && !flags?.can_manage && !flags?.can_authorize) {
    redirect("/");
  }

  const currentYear = new Date().getFullYear();
  const poa = await getMyPoa(currentYear);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi POA {currentYear}</h1>
          <p className="text-sm text-muted-foreground">Tus objetivos del año y su avance.</p>
        </div>

        {!poa ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              Todavía no tienes un POA asignado para {currentYear}. Pide a tu líder que te lo asigne.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {poa.positionName && (
              <p className="text-xs text-muted-foreground">
                Puesto: {poa.positionName} · Departamento: {poa.departmentName ?? "—"}
              </p>
            )}
            {poa.objectives.map((o) => (
              <div key={o.id} className="space-y-2">
                <ComplianceView objective={o} />
                <div className="flex justify-end">
                  <LogUpdateDialog objectiveId={o.id} objectiveTitle={o.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint**

Run: `bunx tsc --noEmit`
Run: `bunx eslint "src/app/(app)/planificacion/ComplianceView.tsx" "src/app/(app)/planificacion/poas/page.tsx" "src/app/(app)/planificacion/poas/LogUpdateDialog.tsx"`
Expected: both clean.

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(app)/planificacion/ComplianceView.tsx" "src/app/(app)/planificacion/poas"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-mi-poa.txt"
```

---

### Task 8: "Mi equipo" screen

**Files:**
- Create: `src/app/(app)/planificacion/equipo/page.tsx`
- Create: `src/app/(app)/planificacion/equipo/AssignPoaDialog.tsx`

- [ ] **Step 1: Write `equipo/AssignPoaDialog.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignPoa,
  getPositionTemplate,
  listActivePositionOptions,
  type ListPositionsOption,
  type SupervisedContactRow,
} from "./actions";

interface ObjectiveDraft {
  title: string;
  kpiMetric: string;
  targetValue: number;
  unit: string;
}

export function AssignPoaDialog({ contact, periodYear }: { contact: SupervisedContactRow; periodYear: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [positions, setPositions] = useState<ListPositionsOption[]>([]);
  const [positionId, setPositionId] = useState(contact.positionId ?? "");
  const [objectives, setObjectives] = useState<ObjectiveDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) listActivePositionOptions().then(setPositions);
  }, [open]);

  async function loadTemplate(id: string) {
    setPositionId(id);
    if (!id) return;
    const template = await getPositionTemplate(id);
    setObjectives(template);
  }

  function updateObjective(index: number, patch: Partial<ObjectiveDraft>) {
    setObjectives((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function submit() {
    setError(null);
    const clean = objectives.filter((o) => o.title.trim() && o.kpiMetric.trim());
    startTransition(async () => {
      const result = await assignPoa({
        contactId: contact.contactId,
        departmentId: contact.departmentId,
        positionId: positionId || null,
        periodYear,
        objectives: clean,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        {contact.hasPoaForYear ? "Ver/editar" : "Asignar POA"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>POA {periodYear} — {contact.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Puesto (plantilla)</label>
            <Select value={positionId} onValueChange={(v) => v && loadTemplate(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => positions.find((p) => p.id === positionId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Objetivos para este año</p>
            {objectives.map((o, i) => (
              <div key={i} className="space-y-2 rounded-xl border p-3">
                <Input
                  placeholder="Título del objetivo"
                  value={o.title}
                  onChange={(e) => updateObjective(i, { title: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Métrica"
                    value={o.kpiMetric}
                    onChange={(e) => updateObjective(i, { kpiMetric: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="Meta"
                    value={o.targetValue}
                    onChange={(e) => updateObjective(i, { targetValue: Number(e.target.value) })}
                  />
                  <Input
                    placeholder="Unidad"
                    value={o.unit}
                    onChange={(e) => updateObjective(i, { unit: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600"
                  onClick={() => setObjectives((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-3.5" />
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setObjectives((prev) => [...prev, { title: "", kpiMetric: "", targetValue: 0, unit: "" }])}
            >
              <Plus className="size-3.5" />
              Agregar objetivo
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar POA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Note:** this dialog only supports *creating* a new POA (its `assignPoa` call always inserts). If `contact.hasPoaForYear` is true, the button still says "Ver/editar" but submitting will hit the `poas` table's `unique (contact_id, period_year)` constraint and surface a Postgres error as `result.error`. That's an acceptable, honest v1 gap matching the "Scope note" in Task 5 (no in-place edit flow yet) — call this out to the user rather than silently shipping a misleading button label; renaming the button to just "Asignar POA" (dropping "Ver/editar") is the one small fix to make in this task so the UI doesn't promise something it doesn't do yet:

```tsx
      <DialogTrigger render={<Button size="sm" className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        {contact.hasPoaForYear ? "Ya asignado" : "Asignar POA"}
      </DialogTrigger>
```

And disable opening it at all when already assigned, since there's nothing useful to do here yet for an existing POA:

```tsx
    <Dialog open={open} onOpenChange={(next) => !contact.hasPoaForYear && setOpen(next)}>
      <DialogTrigger
        render={<Button size="sm" disabled={contact.hasPoaForYear} className="bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}
      >
        {contact.hasPoaForYear ? "Ya asignado" : "Asignar POA"}
      </DialogTrigger>
```

- [ ] **Step 2: Write `equipo/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSupervisedContacts } from "./actions";
import { AssignPoaDialog } from "./AssignPoaDialog";

export default async function MiEquipoPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "planificacion" });
  const flags = flagsRows?.[0];
  if (!flags?.can_manage && !flags?.can_authorize) {
    redirect("/");
  }

  const currentYear = new Date().getFullYear();
  const contacts = await listSupervisedContacts(currentYear);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi equipo — POAs {currentYear}</h1>
          <p className="text-sm text-muted-foreground">
            Gente de tu(s) departamento(s) y el estado de su POA de este año.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {contacts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No tienes departamentos asignados para supervisar todavía.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Nombre</th>
                  <th className="pb-2 pr-3 font-medium">Departamento</th>
                  <th className="pb-2 pr-3 font-medium">Puesto</th>
                  <th className="pb-2 pr-3 font-medium">Estado</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.contactId} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{c.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.departmentName ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.positionName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.hasPoaForYear ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {c.hasPoaForYear ? "Asignado" : "Sin POA"}
                      </span>
                    </td>
                    <td className="py-2">
                      <AssignPoaDialog contact={c} periodYear={currentYear} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint**

Run: `bunx tsc --noEmit`
Run: `bunx eslint "src/app/(app)/planificacion/equipo/page.tsx" "src/app/(app)/planificacion/equipo/AssignPoaDialog.tsx"`
Expected: both clean.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(app)/planificacion/equipo/page.tsx" "src/app/(app)/planificacion/equipo/AssignPoaDialog.tsx"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-mi-equipo.txt"
```

---

### Task 9: CSV export

**Files:**
- Modify: `src/app/(app)/planificacion/actions.ts` (add `exportPlanificacionCsv`)
- Create: `src/app/(app)/planificacion/ExportButton.tsx`
- Modify: `src/app/(app)/planificacion/equipo/page.tsx` (add the button, `can_manage`/`can_authorize` only)

- [ ] **Step 1: Add the export action to `actions.ts`**

Append to `src/app/(app)/planificacion/actions.ts`:

```ts
function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

export async function exportPlanificacionCsv(periodYear: number): Promise<ActionResult & { csv?: string }> {
  const flags = await callerFlags();
  if (!flags.canManage && !flags.canAuthorize) return { error: "No autorizado" };

  const admin = createAdminClient();
  let query = admin
    .from("poas")
    .select(
      "id, contact_id, contacts(first_name, last_name), department_id, departments(name), poa_objectives(title, kpi_metric, target_value, unit, poa_objective_updates(value, recorded_at))",
    )
    .eq("period_year", periodYear);

  if (!flags.canAuthorize) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: deptRows } = await admin
      .from("planificacion_department_leaders")
      .select("department_id")
      .eq("app_user_id", user?.id ?? "");
    const departmentIds = (deptRows ?? []).map((r) => r.department_id);
    if (departmentIds.length === 0) return { csv: toCsvRow(["persona", "departamento", "objetivo", "metrica", "meta", "ultimo_valor", "fecha"]) };
    query = query.in("department_id", departmentIds);
  }

  const { data: poas } = await query;
  const lines = [toCsvRow(["persona", "departamento", "objetivo", "metrica", "meta", "ultimo_valor", "fecha"])];

  for (const poa of poas ?? []) {
    const contact = Array.isArray(poa.contacts) ? poa.contacts[0] : poa.contacts;
    const dept = Array.isArray(poa.departments) ? poa.departments[0] : poa.departments;
    const personName = contact ? `${contact.first_name} ${contact.last_name}` : "";
    for (const objective of poa.poa_objectives ?? []) {
      const updates = objective.poa_objective_updates ?? [];
      const latest = updates.length > 0 ? updates[updates.length - 1] : null;
      lines.push(
        toCsvRow([
          personName,
          dept?.name ?? "",
          objective.title,
          objective.kpi_metric,
          `${objective.target_value}${objective.unit ? ` ${objective.unit}` : ""}`,
          latest ? String(latest.value) : "",
          latest ? latest.recorded_at : "",
        ]),
      );
    }
  }

  return { csv: lines.join("\r\n") };
}
```

- [ ] **Step 2: Write `ExportButton.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPlanificacionCsv } from "./actions";

export function ExportReportButton({ periodYear }: { periodYear: number }) {
  const [isPending, startTransition] = useTransition();

  function exportCsv() {
    startTransition(async () => {
      const res = await exportPlanificacionCsv(periodYear);
      if (res.error || !res.csv) return;
      const blob = new Blob(["\ufeff" + res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `planificacion-poas-${periodYear}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button variant="outline" onClick={exportCsv} disabled={isPending} className="gap-2">
      <Download className="size-4" />
      Exportar reporte
    </Button>
  );
}
```

- [ ] **Step 3: Wire the button into `equipo/page.tsx`**

In `src/app/(app)/planificacion/equipo/page.tsx`, add the import and render it next to the heading:

```tsx
import { ExportReportButton } from "../ExportButton";
```

```tsx
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi equipo — POAs {currentYear}</h1>
            <p className="text-sm text-muted-foreground">
              Gente de tu(s) departamento(s) y el estado de su POA de este año.
            </p>
          </div>
          <ExportReportButton periodYear={currentYear} />
        </div>
```

(replacing the plain `<div className="space-y-1">...</div>` block from Task 8 Step 2 with this wrapping `flex` row).

- [ ] **Step 4: Typecheck, lint**

Run: `bunx tsc --noEmit`
Run: `bunx eslint "src/app/(app)/planificacion/actions.ts" "src/app/(app)/planificacion/ExportButton.tsx" "src/app/(app)/planificacion/equipo/page.tsx"`
Expected: both clean.

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(app)/planificacion/actions.ts" "src/app/(app)/planificacion/ExportButton.tsx" "src/app/(app)/planificacion/equipo/page.tsx"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-export.txt"
```

---

### Task 10: Sidebar and layout wiring

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Add permission props in `layout.tsx`**

In `src/app/(app)/layout.tsx`, add after the `canManageServiciosGenerales` line (inside the `<AppShell ...>` call):

```tsx
      canViewPlanificacion={Boolean(
        permissions.get("planificacion")?.can_view
          || permissions.get("planificacion")?.can_manage
          || permissions.get("planificacion")?.can_authorize,
      )}
      canManagePlanificacion={Boolean(permissions.get("planificacion")?.can_manage)}
      canAuthorizePlanificacion={Boolean(permissions.get("planificacion")?.can_authorize)}
```

- [ ] **Step 2: Add the new props to `Sidebar.tsx`'s prop list**

In `src/app/(app)/Sidebar.tsx`, add alongside the other `canView*`/`canManage*` props (both in the destructured parameter list and the TypeScript type block — follow the exact pattern already there for `canViewServiciosGenerales`/`canManageServiciosGenerales`):

```tsx
  canViewPlanificacion,
  canManagePlanificacion,
  canAuthorizePlanificacion,
```

```tsx
  canViewPlanificacion: boolean;
  canManagePlanificacion: boolean;
  canAuthorizePlanificacion: boolean;
```

- [ ] **Step 3: Add a `ClipboardCheck` (or similar unused) icon import**

Check the top of `Sidebar.tsx`'s lucide-react import block for an available icon not already imported — use `Target` (fits a KPI/goals module) and add it to the destructured import list from `"lucide-react"`.

- [ ] **Step 4: Add the Planificación nav group**

Add a new `planificacionLinks` array near `mantenimientosLinks`/`suministrosSubLinks` (same file):

```tsx
  // "Mi POA" is visible to anyone granted can_view/can_manage/can_authorize
  // on 'planificacion' - gated the same way every other module in this app
  // is (never open by default). "Mi equipo" needs can_manage or
  // can_authorize; "Puestos" and "Líderes" are Consejo-only (can_authorize).
  const planificacionLinks: NavLink[] = [
    ...(canViewPlanificacion ? [{ href: "/planificacion/poas", label: "Mi POA", icon: Target }] : []),
    ...(canManagePlanificacion || canAuthorizePlanificacion
      ? [{ href: "/planificacion/equipo", label: "Mi equipo", icon: Users }]
      : []),
    ...(canAuthorizePlanificacion
      ? [
          { href: "/planificacion/puestos", label: "Puestos y KPIs", icon: ShieldCheck },
          { href: "/planificacion/lideres", label: "Líderes por departamento", icon: Network },
        ]
      : []),
  ];
```

- [ ] **Step 5: Render the FlyoutNavGroup**

In the `<nav>` render block, add a new section (place it near the `mantenimientosLinks` flyout, matching the existing structure of a `<div className="space-y-1 pt-4">` wrapper with a small label paragraph above the `FlyoutNavGroup`):

```tsx
          {planificacionLinks.length > 0 && (
            <div className="space-y-1 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Target className="size-3.5" />
                  Planificación
                </p>
              )}
              <FlyoutNavGroup
                label="Planificación"
                icon={Target}
                links={planificacionLinks}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </div>
          )}
```

- [ ] **Step 6: Typecheck, lint**

Run: `bunx tsc --noEmit`
Run: `bunx eslint "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"`
Expected: both clean (the one pre-existing, unrelated `no-html-link-for-pages` warning on the `/` logo link, if still present, is not something this task introduces — leave it alone).

- [ ] **Step 7: Commit**

```powershell
git add "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"
git commit -F "$env:TEMP\claude\commit-msg-planificacion-sidebar.txt"
```

---

### Task 11: Final verification and deploy handoff

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors anywhere in the repo.

- [ ] **Step 2: Full lint of every new/modified file**

Run:
```powershell
bunx eslint "src/app/(app)/planificacion/**/*.ts" "src/app/(app)/planificacion/**/*.tsx" "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"
```
Expected: clean. If PowerShell's glob doesn't expand `**`, list every file from the "File Structure" section explicitly instead (same workaround used earlier today for Servicios Generales).

- [ ] **Step 3: Production build**

Run: `bun run build`
Expected: succeeds, and the route list includes `/planificacion/poas`, `/planificacion/equipo`, `/planificacion/puestos`, `/planificacion/lideres`.

- [ ] **Step 4: Manual smoke test**

With a Super Admin or Consejo account (already granted `can_view`/`can_authorize` by Task 1's migration):
1. Visit `/planificacion/puestos`, create a puesto with 2 objectives.
2. Visit `/planificacion/lideres`, assign yourself (or a test account) as leader of one department.
3. Visit `/planificacion/equipo`, confirm people in that department show "Sin POA", assign one using the puesto template from step 1.
4. Visit `/planificacion/poas` as that person (or re-check as Consejo via `/planificacion/equipo` → re-open — note per Task 8 this is create-only, so just confirm the assigned POA's objectives appear), log a progress update, confirm the compliance view shows it and the week/month/quarter/year toggle changes the bucketing.
5. Export the CSV from `/planificacion/equipo` and open it to confirm the rows match.

- [ ] **Step 5: Commit message and deploy handoff**

Write a final commit message (if any uncommitted changes remain from fixups during Steps 1-4) to a temp file and commit with `git commit -F`, following the same pattern as every other commit in this plan.

Then — **do not run `bunx vercel --prod` automatically.** Ask the user explicitly: "¿Despliego Planificación a producción?" and wait for a clear yes before deploying, per this session's standing rule (and the auto-mode permission classifier that blocks unconfirmed production deploys). After deploying, verify with `bunx vercel inspect https://gente.sanchezbusinesscorp.com`.

---

## Self-Review Notes

**Spec coverage:** every section of `docs/superpowers/specs/2026-10-24-planificacion-poas-design.md` maps to a task — module/permissions (Task 1), puesto catalog (Tasks 2, 5), `planificacion_department_leaders` (Tasks 2, 2b), `poas`/`poa_objectives`/`poa_objective_updates` + RLS (Task 3), "Mi POA" (Task 7), "Mi equipo" (Tasks 6, 8), "Puestos" screen (Task 5), CSV export (Task 9), Sidebar/permission wiring (Task 10). The one deliberate deviation from the spec's literal wording — making `can_view` a real, grantable permission rather than "universal"/hardcoded-open — is called out explicitly in Task 1 with the reasoning (this session's own, repeatedly-reinforced "nothing visible without an explicit grant" policy, established after the spec's wording was drafted).

**Known v1 gaps, stated plainly (not silently):** no in-place editing of an existing POA's objectives or a puesto's template after creation (Tasks 5 and 8 both call this out); no approval/proposal workflow; targets are single annual numbers only — all three match the spec's own "Out of scope" section.

**Type consistency check:** `PoaRow`/`PoaObjectiveRow`/`PoaObjectiveUpdateRow` (Task 4) are reused as-is by `ComplianceView` (Task 7) and nowhere redefined with different field names. `AssignPoaInput`/`SupervisedContactRow`/`PositionObjectiveOption` (Task 6) match the fields `AssignPoaDialog.tsx` (Task 8) actually reads/writes. `CallerFlags` (Task 4) is the one shared shape every other actions.ts imports `callerFlags()` to produce, rather than each file inventing its own ad hoc permission check.
