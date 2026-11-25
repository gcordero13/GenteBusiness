-- Registers the "Aprendizaje" module (cursos, historia, evaluaciones,
-- gamificación - see docs/superpowers/specs/2026-11-25-aprendizaje-design.md).
-- can_view   = browse the catalog and take courses.
-- can_manage = create/edit courses, assign them, see everyone's progress.
-- Approved with the user: can_view is granted to EVERY role profile because
-- this is company-wide training. It is still an explicit, revocable row in
-- Perfiles de rol (nothing is open to "any authenticated user" without the
-- permission). can_manage starts with Super Admin only.
insert into public.modules (key, label) values ('aprendizaje', 'Aprendizaje');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select
  rp.id,
  m.id,
  true,
  false,
  false,
  false,
  false,
  (rp.name = 'Super Admin'),
  false
from public.role_profiles rp
cross join public.modules m
where m.key = 'aprendizaje';
