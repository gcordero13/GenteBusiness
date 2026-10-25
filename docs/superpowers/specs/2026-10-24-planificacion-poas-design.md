# Planificación — POAs (Design)

## Context

A new module, **Planificación**, meant to eventually replace Monday.com for this purpose. It will have two tabs — **POAs** and **Tareas** — but this spec covers only the POAs half, per an explicit decomposition decision with the user: POAs is the larger, more novel piece (a KPI/goal-tracking system with no precedent elsewhere in this codebase) and ships first; Tareas (a task board, confirmed to need subtasks, follow/subscribe, and configurable per-status notifications — closer to "real Monday" than the simple kanban first discussed) gets its own brainstorming round and spec afterward.

A POA ("Plan Operativo Anual") is an employee's annual set of objectives/KPIs. Every position ("puesto") should have one — not just management — confirmed with the user ("todos los cargos tendrán sus KPIs, no solamente gerencia").

## Key decisions from brainstorming

- **One POA per person per year, with multiple objectives inside it** (not one POA per objective).
- **"Puesto" becomes a reusable, company-wide KPI template** — today `contacts.position` is free text with no shared structure; POAs need puestos to carry a template of objectives/KPIs that any employee in that role starts from. One catalog for the whole company (not per-department), editable only by RRHH/Consejo.
- **A leader assigns the POA** to each person in their department, starting from that person's puesto template, and can add/adjust objectives for that specific person/year — the template is a starting point, not a locked value.
- **Each objective has one annual target** (not a target that varies by period) **and an open-ended log of dated progress entries** — "según se va actualizando" (whenever it gets updated), not a fixed cadence. The UI aggregates/filters that log by week/month/quarter/year to show the compliance trend against the single annual target.
- **Supervision scope is by department, not the org chart** — a departure from Suministros' `reports_to_id`-chain pattern. A "líder" sees everyone in the department(s) they're explicitly assigned to supervise.
- **A leader can be assigned more than one department** — this is per-person, not per-role-profile, since two people sharing a role profile (e.g. "Gerente") could lead different departments. This is a genuinely new permission pattern for this codebase: every other module's permissions are purely role-profile-based. A new junction table is needed.
- **"Consejo"** (an existing role profile already in this system) gets company-wide POA authority — sees and assigns across every department, no per-department assignment needed. If "Consejo" turns out to mean something unrelated to this organizationally, that's a question to revisit before implementation, but the user did not object when this was proposed.

## Permissions

New module, `module_key: 'planificacion'` (shared later by the Tareas tab too):

- `can_view` — universal: every authenticated user can see and log progress on their **own** POA. No department scoping needed for this.
- `can_manage` — "líder": can view and assign/edit POAs for people in whichever department(s) they're explicitly assigned to supervise (see `planificacion_department_leaders` below). Does **not** by itself grant company-wide access — the department list is what scopes it.
- `can_authorize` — "Consejo": company-wide. Sees and can assign POAs for anyone, in any department, and manages the puesto/KPI-template catalog. Granted to the existing "Consejo" role profile by default.

## Data Model

```sql
-- Which departments a given can_manage user is allowed to supervise -
-- per-person, not per-role-profile, since leaders sharing a role profile
-- can lead different departments. New pattern for this codebase (every
-- other module's permissions are role-profile-only) - confirmed with the
-- user ("un líder puede tener varios departamentos").
create table public.planificacion_department_leaders (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (app_user_id, department_id)
);

-- The reusable KPI template per position - one catalog for the whole
-- company, editable only by can_authorize (Consejo/RRHH).
create table public.poa_positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create table public.poa_position_objectives (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.poa_positions(id) on delete cascade,
  title text not null,
  kpi_metric text not null,          -- e.g. "Ventas mensuales (RD$)"
  suggested_target numeric,          -- starting point the leader can adjust per person
  unit text,                         -- e.g. "%", "RD$", "unidades"
  sort_order integer not null default 0
);

-- Formal link from a contact to the puesto catalog, additive to the
-- existing free-text contacts.position (which stays as-is for display
-- everywhere else in the app) - only used to pick which template a
-- leader starts from when assigning a POA.
alter table public.contacts
  add column poa_position_id uuid references public.poa_positions(id);

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

-- Dated progress log - entered whenever, not on a fixed schedule.
-- Compliance views roll these up by week/month/quarter/year against the
-- objective's single target_value.
create table public.poa_objective_updates (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.poa_objectives(id) on delete cascade,
  value numeric not null,
  recorded_at date not null default current_date,
  recorded_by uuid not null references public.app_users(id),
  note text,
  created_at timestamptz not null default now()
);
```

## RLS

- `poa_positions` / `poa_position_objectives`: select open to any authenticated user (so a leader can browse templates while assigning); insert/update/delete require `can_authorize`.
- `poas` / `poa_objectives` / `poa_objective_updates`: select/update allowed when any of —
  - the row's `contact_id` matches the caller's own contact (resolved by email, same pattern used throughout this codebase), **or**
  - the caller has `can_authorize`, **or**
  - the caller has `can_manage` **and** the row's `department_id` is in their `planificacion_department_leaders` list.
  Insert of a new `poas` row (assigning someone's POA) requires `can_authorize` or `can_manage` with that department in their list — an employee cannot create their own POA, only log progress on one already assigned to them.

## Screens

- **`/planificacion/poas`** ("Mi POA") — every employee's own objectives, their target, a compliance indicator, and a form to log a new dated progress value. Always visible (can_view is universal).
- **`/planificacion/poas/equipo`** (líder/Consejo, gated by `can_manage`/`can_authorize`) — list of people in the leader's assigned department(s) (or everyone, for Consejo), each with a rolled-up compliance summary; drill into a person to assign a new POA (pick their puesto template, adjust objectives/targets) or edit an existing one.
- **`/planificacion/poas/puestos`** (Consejo/RRHH only, `can_authorize`) — CRUD for the puesto catalog and each one's objective/KPI template.
- A period filter (semana/mes/trimestre/año) on both "Mi POA" and "Mi equipo" controls how the progress log is aggregated for the compliance view.
- CSV export of POA compliance, matching every other module's export convention.

## Out of scope for this delivery

- The Tareas tab (separate spec, separate brainstorming round).
- Any approval/proposal workflow where the employee proposes their own targets — the leader assigns directly.
- Per-period (vs. single annual) targets.
- Automated notifications/reminders tied to POA progress (the user's notification requirements so far are specific to Tareas).
