insert into public.modules (key, label) values ('document_stamps', 'Sellos y Firmas');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, false, (rp.name = 'Super Admin'), false, false, false, false, false
from public.role_profiles rp
cross join public.modules m
where m.key = 'document_stamps';
