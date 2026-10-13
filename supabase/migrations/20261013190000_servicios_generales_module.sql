-- Registers the new "Servicios Generales" module: scheduled/reactive
-- maintenance of company assets and facility services (vehicles, A/C,
-- fumigation, equipment/installations, buildings/areas). Deliberately
-- separate from both the unrelated `maintenance` (IT) module and
-- GoServices' "Servicios Generales" role/ticket type - confirmed with the
-- user after surfacing that naming overlap.
--   can_manage = the Servicios Generales team: create/edit/complete/cancel
--                 maintenance records and series, and export the report.
-- Viewing the calendar is open to every authenticated user (no permission
-- needed), same as Suministros' article catalog.
insert into public.modules (key, label) values ('servicios_generales', 'Servicios Generales');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, false, false, false, false, false, (rp.name = 'Super Admin'), false
from public.role_profiles rp
cross join public.modules m
where m.key = 'servicios_generales';
