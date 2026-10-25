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
