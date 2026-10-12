-- Lets "Servicios Generales" (the supervisor role profile) also appear in
-- the GoServices "Asignado a" dropdown, same as the ejecutor profiles
-- (UTILITY / Mensajeria) — confirmed with the user ("al igual que los
-- ejecutores quiero que sean los que aparecen para gestionar"). This only
-- adds can_manage (ejecutor-eligible) on top of its existing can_authorize
-- (gestor) flag; it does not change anything else about the role.
update public.role_profile_permissions rpp
set can_manage = true
from public.modules m, public.role_profiles rp
where rpp.module_id = m.id
  and rpp.role_profile_id = rp.id
  and m.key = 'goservices'
  and rp.name = 'Servicios Generales';
