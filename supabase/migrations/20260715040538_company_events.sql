create table public.company_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  created_at timestamptz not null default now()
);

alter table public.company_events enable row level security;

create policy "company_events_select_any_authenticated" on public.company_events
for select
using ( auth.uid() is not null );

create policy "company_events_write_platform_managers" on public.company_events
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "company_events_update_platform_managers" on public.company_events
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "company_events_delete_platform_managers" on public.company_events
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
