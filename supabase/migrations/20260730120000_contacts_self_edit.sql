begin;

drop policy "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
for select
using (
  coalesce((select can_view from public.get_my_module_permissions('contacts')), false)
  or email = (select email from public.app_users where id = auth.uid())
);

-- Note: the "using" clause here is intentionally broader than the "with check"
-- clause. Postgres RLS filters rows out of an UPDATE's target set via "using"
-- silently (0 rows affected, no error) but raises a real error when "with
-- check" (or a before-row trigger) rejects a row that WAS a target. If "using"
-- only allowed can_edit/can_deactivate/self, a Viewer attempting to edit
-- someone else's contact would match 0 rows and get error = null instead of
-- a real authorization error, since email wouldn't match and can_edit/
-- can_deactivate are both false. Mirroring contacts_select's visibility here
-- (can_view or self) makes such attempts real candidates so "with check" and
-- the enforce_contacts_update_permissions trigger can reject them with an
-- actual error, while still relying on "with check" (and the trigger) to
-- decide what's actually writable.
drop policy "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
for update
using (
  coalesce((select can_view from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
  or email = (select email from public.app_users where id = auth.uid())
)
with check (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
  or email = (select email from public.app_users where id = auth.uid())
);

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
  is_self boolean;
begin
  select * into flags from public.get_my_module_permissions('contacts');

  select exists (
    select 1 from public.app_users au
    where au.id = auth.uid() and au.email = old.email
  ) into is_self;

  if flags is null and not is_self then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.position, new.fleet_phone, new.extension, new.has_whatsapp
  ) is distinct from (
    old.position, old.fleet_phone, old.extension, old.has_whatsapp
  ) and not (is_self or coalesce(flags.can_edit, false)) then
    raise exception 'not authorized to edit contact fields';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.department_id, new.company_id,
    new.photo_url, new.reports_to_id, new.birth_date
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

commit;
