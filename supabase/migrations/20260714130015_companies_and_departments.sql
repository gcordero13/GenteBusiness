create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.departments enable row level security;

create policy "companies_select_any_authenticated" on public.companies
for select
using ( auth.uid() is not null );

create policy "companies_write_platform_managers" on public.companies
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "companies_update_platform_managers" on public.companies
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "companies_delete_platform_managers" on public.companies
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "departments_select_any_authenticated" on public.departments
for select
using ( auth.uid() is not null );

create policy "departments_write_platform_managers" on public.departments
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "departments_update_platform_managers" on public.departments
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "departments_delete_platform_managers" on public.departments
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
