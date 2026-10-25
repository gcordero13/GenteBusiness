-- Registers the new "Planificación" module (POAs tab first; Tareas tab
-- ships later under the same module_key). can_view is a real, grantable
-- permission like every other module in this app - NOT hardcoded open to
-- everyone - per the user's explicit, repeated instruction earlier this
-- session that nothing should be visible without an explicit grant in
-- Perfiles de rol (the Suministros/Servicios Generales/GoServices
-- visibility fixes). Granted by default only to 'Super Admin' and the
-- existing 'Consejo' role profile (confirmed with the user: Consejo gets
-- company-wide POA authority, reusing that existing role rather than
-- inventing a new concept).
--   can_view      = see and log progress on your OWN POA.
--   can_manage    = "líder": see/assign POAs for whichever department(s)
--                   this specific person is assigned to supervise (see
--                   planificacion_department_leaders, next migration) -
--                   NOT granted company-wide just by holding this flag.
--   can_authorize = "Consejo": company-wide - every department, plus
--                   manages the puesto/KPI-template catalog.
insert into public.modules (key, label) values ('planificacion', 'Planificación');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select
  rp.id,
  m.id,
  (rp.name = 'Super Admin' or rp.name = 'Consejo'),
  false,
  false,
  false,
  false,
  (rp.name = 'Super Admin'),
  (rp.name = 'Super Admin' or rp.name = 'Consejo')
from public.role_profiles rp
cross join public.modules m
where m.key = 'planificacion';
