-- Extends records with: an optional link to a registered asset (so the
-- calendar/list can show "Toyota Hilux 2020" instead of a generic
-- description), vehicle-specific service tracking (type, odometer reading
-- at time of service, and an optional "next due at N miles" the team
-- enters themselves - no automatic interval math, since the team already
-- knows their own service intervals), and a cost + vendor pair so every
-- check can carry an expense record, for any category.
alter table public.general_maintenance_records
  add column asset_id uuid references public.general_maintenance_assets(id),
  add column vehicle_service_type text check (vehicle_service_type in (
    'aceite', 'gomas', 'bateria', 'frenos', 'filtro_aire', 'filtro_combustible', 'inspeccion_matricula', 'seguro', 'otro'
  )),
  add column mileage_at_service integer,
  add column next_due_mileage integer,
  add column cost numeric(10, 2),
  add column cost_vendor text;

create index general_maintenance_records_asset_idx on public.general_maintenance_records(asset_id);
