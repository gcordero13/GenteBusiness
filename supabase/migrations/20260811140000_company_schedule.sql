create table public.company_schedule (
  id boolean primary key default true,
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  workdays smallint[] not null default '{1,2,3,4,5}',
  tolerance_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint company_schedule_singleton check (id)
);

insert into public.company_schedule (id) values (true);

alter table public.company_schedule enable row level security;

create policy "company_schedule_select_any_authenticated" on public.company_schedule
  for select using (auth.uid() is not null);

create policy "company_schedule_update_managers" on public.company_schedule
  for update
  using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
