insert into public.modules (key, label) values ('solicitudes_vacaciones', 'Solicitudes: Vacaciones');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, (rp.name = 'Super Admin'), false, false, false, false, false, (rp.name = 'Super Admin')
from public.role_profiles rp
cross join public.modules m
where m.key = 'solicitudes_vacaciones';
