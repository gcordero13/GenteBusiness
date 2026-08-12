-- Lets a user read their own time_clock_punches rows (matched via their
-- contacts row's email, the same way app_users links to contacts elsewhere
-- in this codebase) without needing the service-role client. This is
-- intentionally narrower than "any authenticated user can read" - a user can
-- never see another contact's punches through this policy. It does not
-- depend on (and is not gated by) the ponchador module's can_view flag below
-- - that check happens in the /ponchador page itself, the same way the home
-- page's attendance cards are gated by hikvision_employee_no in app code
-- rather than in RLS.
create policy "time_clock_punches_select_own" on public.time_clock_punches
for select using (
  contact_id in (
    select id from public.contacts
    where email = (select email from public.app_users where id = auth.uid())
  )
);

insert into public.modules (key, label) values ('ponchador', 'Ponchador');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, (rp.name = 'Super Admin'), false, false, false, false, false, false
from public.role_profiles rp
cross join public.modules m
where m.key = 'ponchador';
