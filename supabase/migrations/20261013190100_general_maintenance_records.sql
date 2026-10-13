-- Servicios Generales: scheduled/reactive maintenance records for company
-- assets and facility services. A record with series_id = null is a
-- one-off entry (including a reactive report - "se dañó el A/C", logged
-- by the team with scheduled_date = today). A record with series_id set
-- belongs to a recurring series; completing it auto-generates the next
-- occurrence (application logic, see actions.ts), not a DB trigger.
create table public.general_maintenance_series (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'aires_acondicionados', 'vehiculos', 'fumigacion', 'equipos_instalaciones', 'edificios_areas'
  )),
  department_id uuid references public.departments(id),
  description text not null,
  frequency_interval integer not null check (frequency_interval > 0),
  frequency_unit text not null check (frequency_unit in ('dias', 'semanas', 'meses')),
  is_active boolean not null default true,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create table public.general_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.general_maintenance_series(id),
  category text not null check (category in (
    'aires_acondicionados', 'vehiculos', 'fumigacion', 'equipos_instalaciones', 'edificios_areas'
  )),
  department_id uuid references public.departments(id),
  description text not null,
  scheduled_date date not null,
  status text not null default 'programado' check (status in ('programado', 'completado', 'vencido', 'cancelado')),
  completed_at timestamptz,
  completed_by uuid references public.app_users(id),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create index general_maintenance_records_date_idx on public.general_maintenance_records(scheduled_date);
create index general_maintenance_records_series_idx on public.general_maintenance_records(series_id);

alter table public.general_maintenance_series enable row level security;
alter table public.general_maintenance_records enable row level security;

create policy "general_maintenance_series_select_all" on public.general_maintenance_series
  for select
  using (auth.uid() is not null);

create policy "general_maintenance_series_write_managers" on public.general_maintenance_series
  for all
  using (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false));

create policy "general_maintenance_records_select_all" on public.general_maintenance_records
  for select
  using (auth.uid() is not null);

create policy "general_maintenance_records_write_managers" on public.general_maintenance_records
  for all
  using (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false));
