-- The Servicios Generales calendar was opened to every authenticated user
-- (like Suministros' catalog), but the user wants it hidden from the menu
-- and inaccessible to anyone not explicitly granted access - same gating
-- every other module uses (can_view, set per role profile in Perfiles de
-- rol). Replaces the blanket "any authenticated user" select policies.
drop policy "general_maintenance_series_select_all" on public.general_maintenance_series;
drop policy "general_maintenance_records_select_all" on public.general_maintenance_records;

create policy "general_maintenance_series_select" on public.general_maintenance_series
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('servicios_generales')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false)
  );

create policy "general_maintenance_records_select" on public.general_maintenance_records
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('servicios_generales')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false)
  );

-- Super Admin had can_view = false for this module (can_manage was enough
-- when the calendar was open to everyone) - grant it can_view too so it
-- doesn't lose access now that viewing is gated.
update public.role_profile_permissions
set can_view = true
where module_id = (select id from public.modules where key = 'servicios_generales')
  and role_profile_id = (select id from public.role_profiles where name = 'Super Admin');
