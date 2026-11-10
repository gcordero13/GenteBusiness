-- Super Admin must not automatically see or manage every vacation/permission
-- request - oversight here is reserved for whoever deliberately holds
-- "Gestionar" on this module (Gestion Humana), granted explicitly via the
-- role profiles admin UI, never inherited from being a system administrator.
-- (Already applied directly to production; this documents the same change
-- for reproducibility on any future environment seeded from these migrations.)
update public.role_profile_permissions rpp
set can_view = false, can_authorize = false
from public.role_profiles rp, public.modules m
where rpp.role_profile_id = rp.id
  and rpp.module_id = m.id
  and rp.name = 'Super Admin'
  and m.key = 'solicitudes_vacaciones';
