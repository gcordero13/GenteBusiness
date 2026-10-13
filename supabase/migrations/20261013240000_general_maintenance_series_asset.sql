-- "Planes de mantenimiento" (recurring series) can now be tied to a
-- specific registered asset, same as records - so a recurring plan for
-- "cambio de aceite cada 3 meses" stays linked to that one vehicle, and
-- every future occurrence it generates carries the asset along.
alter table public.general_maintenance_series
  add column asset_id uuid references public.general_maintenance_assets(id);
