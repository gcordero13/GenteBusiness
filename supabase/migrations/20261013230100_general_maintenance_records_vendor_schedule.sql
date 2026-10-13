-- Replaces the free-text cost_vendor with a reference to the new vendors
-- registry; adds an optional appointment time (so A/C checks can have a
-- day AND a time, not just a date) and a date-based "next due" for the
-- vehicle service types that renew by time rather than mileage (batería,
-- seguro, marbete) instead of mileage.
alter table public.general_maintenance_records
  drop column cost_vendor,
  add column vendor_id uuid references public.general_maintenance_vendors(id),
  add column scheduled_time time,
  add column next_due_date date;

-- 'inspeccion_matricula' wasn't needed (per the user); 'marbete' (the DR
-- vehicle registration/tax renewal sticker) replaces it. The column is new
-- and unused in production yet, so it's simplest to drop and recreate with
-- the corrected check constraint rather than alter the constraint in place.
alter table public.general_maintenance_records drop column vehicle_service_type;
alter table public.general_maintenance_records add column vehicle_service_type text check (vehicle_service_type in (
  'aceite', 'gomas', 'bateria', 'frenos', 'filtro_aire', 'filtro_combustible', 'marbete', 'seguro', 'otro'
));
