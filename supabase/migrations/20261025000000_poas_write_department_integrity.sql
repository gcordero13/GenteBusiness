-- Closes a privilege-escalation gap found in final review: the original
-- poas_write policy only checked that a líder (can_manage) supervises the
-- row's department_id - it never verified department_id actually matches
-- the target contact's real department_id. A líder could forge a poas
-- insert pointing at an arbitrary employee outside their real department,
-- as long as they supervised the department_id they chose to write. This
-- tightens the with check so department_id must always equal the
-- contact's real department, for every writer (can_authorize included -
-- Consejo shouldn't be able to create a data-integrity-violating row
-- either, even though they're otherwise unrestricted).
drop policy "poas_write" on public.poas;

create policy "poas_write" on public.poas
  for all
  using (
    coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
    or (
      coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
      and department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
    )
  )
  with check (
    department_id = (select department_id from public.contacts where id = contact_id)
    and (
      coalesce((select can_authorize from public.get_my_module_permissions('planificacion')), false)
      or (
        coalesce((select can_manage from public.get_my_module_permissions('planificacion')), false)
        and department_id in (select department_id from public.planificacion_department_leaders where app_user_id = auth.uid())
      )
    )
  );
