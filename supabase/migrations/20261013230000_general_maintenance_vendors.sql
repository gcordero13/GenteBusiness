-- A selectable list of providers/vendors (talleres, ferreterías, etc.) -
-- confirmed with the user: instead of free-typing a provider name on every
-- check, register it once here and pick it from a list, same pattern as
-- Activos.
create table public.general_maintenance_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  notes text,
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

alter table public.general_maintenance_vendors enable row level security;

create policy "general_maintenance_vendors_select" on public.general_maintenance_vendors
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('servicios_generales')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false)
  );

create policy "general_maintenance_vendors_write_managers" on public.general_maintenance_vendors
  for all
  using (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false));
