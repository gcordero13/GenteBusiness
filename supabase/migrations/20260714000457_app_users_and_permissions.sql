create table public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role_profile_id uuid not null references public.role_profiles (id),
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.get_my_role_flags()
returns table (
  can_view boolean,
  can_add boolean,
  can_edit boolean,
  can_delete boolean,
  can_deactivate boolean,
  can_manage_platform boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select rp.can_view, rp.can_add, rp.can_edit, rp.can_delete, rp.can_deactivate, rp.can_manage_platform
  from public.app_users au
  join public.role_profiles rp on rp.id = au.role_profile_id
  where au.id = auth.uid();
$$;

alter table public.role_profiles enable row level security;
alter table public.app_users enable row level security;

create policy "role_profiles_all_platform_managers" on public.role_profiles
for all
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "app_users_select_self_or_platform_manager" on public.app_users
for select
using (
  id = auth.uid()
  or coalesce((select can_manage_platform from public.get_my_role_flags()), false)
);

create policy "app_users_write_platform_managers" on public.app_users
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "app_users_update_platform_managers" on public.app_users
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "app_users_delete_platform_managers" on public.app_users
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
