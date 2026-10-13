-- Registry of individually-tracked assets within Servicios Generales (a
-- department's 3 separate A/C units, each vehicle with its own plate and
-- mileage, etc.) - confirmed with the user: assets are created once in
-- their own section, then picked from a list when scheduling maintenance,
-- instead of a free-text description per record.
create table public.general_maintenance_assets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'aires_acondicionados', 'vehiculos', 'fumigacion', 'equipos_instalaciones', 'edificios_areas'
  )),
  name text not null,
  brand text,
  -- Free text spec - "12,000 BTU" for an A/C, "Full" trim level, etc.
  spec text,
  -- Vehicles only.
  license_plate text,
  current_mileage integer,
  department_id uuid references public.departments(id),
  assigned_app_user_id uuid references public.app_users(id),
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create index general_maintenance_assets_category_idx on public.general_maintenance_assets(category);

alter table public.general_maintenance_assets enable row level security;

create policy "general_maintenance_assets_select" on public.general_maintenance_assets
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('servicios_generales')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false)
  );

create policy "general_maintenance_assets_write_managers" on public.general_maintenance_assets
  for all
  using (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false));
