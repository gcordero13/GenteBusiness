begin;

-- 1. New tables

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.modules (key, label) values
  ('contacts', 'Agenda'),
  ('users', 'Usuarios'),
  ('role_profiles', 'Perfiles de rol'),
  ('companies', 'Empresas'),
  ('departments', 'Departamentos'),
  ('activities', 'Actividades');

create table public.role_profile_permissions (
  id uuid primary key default gen_random_uuid(),
  role_profile_id uuid not null references public.role_profiles (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_deactivate boolean not null default false,
  can_manage boolean not null default false,
  can_authorize boolean not null default false,
  unique (role_profile_id, module_id)
);

-- 2. Migrate existing flat permissions into the new per-module structure
insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, rp.can_view, rp.can_add, rp.can_edit, rp.can_delete, rp.can_deactivate, rp.can_manage_platform, false
from public.role_profiles rp
cross join public.modules m;

-- 3. New permission-check functions
create or replace function public.get_my_module_permissions(p_module_key text)
returns table (
  can_view boolean,
  can_add boolean,
  can_edit boolean,
  can_delete boolean,
  can_deactivate boolean,
  can_manage boolean,
  can_authorize boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select rpp.can_view, rpp.can_add, rpp.can_edit, rpp.can_delete, rpp.can_deactivate, rpp.can_manage, rpp.can_authorize
  from public.app_users au
  join public.role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
  join public.modules m on m.id = rpp.module_id
  where au.id = auth.uid() and m.key = p_module_key;
$$;

create or replace function public.get_my_permissions()
returns table (
  module_key text,
  can_view boolean,
  can_add boolean,
  can_edit boolean,
  can_delete boolean,
  can_deactivate boolean,
  can_manage boolean,
  can_authorize boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select m.key, rpp.can_view, rpp.can_add, rpp.can_edit, rpp.can_delete, rpp.can_deactivate, rpp.can_manage, rpp.can_authorize
  from public.app_users au
  join public.role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
  join public.modules m on m.id = rpp.module_id
  where au.id = auth.uid();
$$;

-- 4. RLS for the two new tables
alter table public.modules enable row level security;
create policy "modules_select_any_authenticated" on public.modules
for select using ( auth.uid() is not null );

alter table public.role_profile_permissions enable row level security;
create policy "role_profile_permissions_select_platform_managers" on public.role_profile_permissions
for select
using ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) );
create policy "role_profile_permissions_write_platform_managers" on public.role_profile_permissions
for all
using ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) );

-- 5. Re-point every existing policy at the module-specific checks

drop policy "role_profiles_all_platform_managers" on public.role_profiles;
create policy "role_profiles_all_platform_managers" on public.role_profiles
for all
using ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) );

drop policy "app_users_select_self_or_platform_manager" on public.app_users;
create policy "app_users_select_self_or_platform_manager" on public.app_users
for select
using ( id = auth.uid() or coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "app_users_write_platform_managers" on public.app_users;
create policy "app_users_write_platform_managers" on public.app_users
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "app_users_update_platform_managers" on public.app_users;
create policy "app_users_update_platform_managers" on public.app_users
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "app_users_delete_platform_managers" on public.app_users;
create policy "app_users_delete_platform_managers" on public.app_users
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "companies_write_platform_managers" on public.companies;
create policy "companies_write_platform_managers" on public.companies
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) );

drop policy "companies_update_platform_managers" on public.companies;
create policy "companies_update_platform_managers" on public.companies
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) );

drop policy "companies_delete_platform_managers" on public.companies;
create policy "companies_delete_platform_managers" on public.companies
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) );

drop policy "departments_write_platform_managers" on public.departments;
create policy "departments_write_platform_managers" on public.departments
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) );

drop policy "departments_update_platform_managers" on public.departments;
create policy "departments_update_platform_managers" on public.departments
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) );

drop policy "departments_delete_platform_managers" on public.departments;
create policy "departments_delete_platform_managers" on public.departments
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) );

drop policy "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
for select
using ( coalesce((select can_view from public.get_my_module_permissions('contacts')), false) );

drop policy "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
for insert
with check ( coalesce((select can_add from public.get_my_module_permissions('contacts')), false) );

drop policy "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
for update
using (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
)
with check (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
);

drop policy "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('contacts')), false) );

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
begin
  select * into flags from public.get_my_module_permissions('contacts');

  if flags is null then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.extension, new.fleet_phone, new.has_whatsapp,
    new.department_id, new.company_id, new.position, new.photo_url, new.reports_to_id, new.birth_date
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.extension, old.fleet_phone, old.has_whatsapp,
    old.department_id, old.company_id, old.position, old.photo_url, old.reports_to_id, old.birth_date
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop policy "contact_photos_write_can_add_or_edit" on storage.objects;
create policy "contact_photos_write_can_add_or_edit" on storage.objects
for insert
with check (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_module_permissions('contacts')), false)
    or coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  )
);

drop policy "contact_photos_update_can_add_or_edit" on storage.objects;
create policy "contact_photos_update_can_add_or_edit" on storage.objects
for update
using (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_module_permissions('contacts')), false)
    or coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  )
);

drop policy "contact_photos_delete_can_edit" on storage.objects;
create policy "contact_photos_delete_can_edit" on storage.objects
for delete
using (
  bucket_id = 'contact-photos'
  and coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
);

drop policy "company_events_write_platform_managers" on public.company_events;
create policy "company_events_write_platform_managers" on public.company_events
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

drop policy "company_events_update_platform_managers" on public.company_events;
create policy "company_events_update_platform_managers" on public.company_events
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

drop policy "company_events_delete_platform_managers" on public.company_events;
create policy "company_events_delete_platform_managers" on public.company_events
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

-- 6. Drop the old flat columns and the old function (cutover complete)
alter table public.role_profiles
  drop column can_view,
  drop column can_add,
  drop column can_edit,
  drop column can_delete,
  drop column can_deactivate,
  drop column can_manage_platform;

drop function public.get_my_role_flags();

commit;
