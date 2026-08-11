create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tolerance_minutes integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index schedule_templates_single_default
  on public.schedule_templates (is_default) where is_default;

create table public.schedule_template_days (
  schedule_template_id uuid not null references public.schedule_templates(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (schedule_template_id, day_of_week)
);

alter table public.schedule_templates enable row level security;
alter table public.schedule_template_days enable row level security;

create policy "schedule_templates_select_any_authenticated" on public.schedule_templates
  for select using (auth.uid() is not null);
create policy "schedule_templates_insert_managers" on public.schedule_templates
  for insert with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
create policy "schedule_templates_update_managers" on public.schedule_templates
  for update
  using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
create policy "schedule_templates_delete_managers" on public.schedule_templates
  for delete using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));

create policy "schedule_template_days_select_any_authenticated" on public.schedule_template_days
  for select using (auth.uid() is not null);

with new_schedule as (
  insert into public.schedule_templates (name, tolerance_minutes, is_default)
  values ('General', 0, true)
  returning id
)
insert into public.schedule_template_days (schedule_template_id, day_of_week, start_time, end_time)
select id, day, '08:00', '17:00'
from new_schedule, unnest(array[1, 2, 3, 4, 5]) as day;

alter table public.departments add column default_schedule_id uuid references public.schedule_templates(id) on delete set null;
update public.departments set default_schedule_id = (select id from public.schedule_templates where is_default);

alter table public.contacts add column schedule_id uuid references public.schedule_templates(id) on delete set null;

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
    new.photo_url, new.reports_to_id, new.birth_date, new.hire_date, new.hikvision_employee_no,
    new.schedule_start_time, new.schedule_end_time, new.schedule_workdays, new.schedule_tolerance_minutes,
    new.schedule_id
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date, old.hire_date, old.hikvision_employee_no,
    old.schedule_start_time, old.schedule_end_time, old.schedule_workdays, old.schedule_tolerance_minutes,
    old.schedule_id
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;
