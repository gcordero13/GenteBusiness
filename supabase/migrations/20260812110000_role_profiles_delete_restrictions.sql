-- Enforces two rules no matter what deletes a role_profiles row (the
-- deleteRoleProfile server action, a future admin script, anything):
-- "Super Admin" can never be deleted (this codebase's own seed/permission
-- logic resolves it by name in several places), and a profile still
-- assigned to at least one app_users row can't be deleted either - the
-- admin must reassign those users from the Users page first. Written as a
-- trigger (not application-code checks) so it's enforced everywhere and
-- directly testable via a plain Supabase client, matching the existing
-- enforce_contacts_update_permissions pattern in
-- supabase/migrations/20260730120000_contacts_self_edit.sql.
create or replace function public.enforce_role_profile_delete_restrictions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_count integer;
begin
  if old.name = 'Super Admin' then
    raise exception 'El perfil Super Admin no se puede eliminar.';
  end if;

  select count(*) into assigned_count from public.app_users where role_profile_id = old.id;
  if assigned_count > 0 then
    raise exception 'Este perfil tiene % usuario(s) asignado(s). Reasígnalos desde Usuarios antes de eliminarlo.', assigned_count;
  end if;

  return old;
end;
$$;

create trigger role_profiles_before_delete
  before delete on public.role_profiles
  for each row execute function public.enforce_role_profile_delete_restrictions();
