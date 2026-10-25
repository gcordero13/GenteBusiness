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
