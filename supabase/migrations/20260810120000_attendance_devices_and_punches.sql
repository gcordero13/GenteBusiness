create table public.time_clock_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ip_address text not null,
  username text not null,
  password text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.time_clock_devices enable row level security;
-- No policies, intentionally: this table holds device passwords. Same
-- precedent as email_settings.smtp_pass (20260728100400_email_settings.sql)
-- - RLS enabled with zero policies denies anon/authenticated entirely. Only
-- the service-role client (used server-side in the /api/attendance/* route
-- handlers after checking the shared agent secret, and in the "Ponchadores"
-- admin server actions after an explicit
-- get_my_module_permissions('attendance_devices').can_manage check) may
-- read or write this table.

create table public.time_clock_punches (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.time_clock_devices (id),
  employee_no_string text not null,
  contact_id uuid references public.contacts (id),
  punched_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (device_id, employee_no_string, punched_at)
);

alter table public.time_clock_punches enable row level security;
-- No policies for the same reason: written only by /api/attendance/punches
-- via the service-role client, after checking the shared agent secret.

alter table public.contacts add column hikvision_employee_no text;

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
    new.photo_url, new.reports_to_id, new.birth_date, new.hire_date, new.hikvision_employee_no
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date, old.hire_date, old.hikvision_employee_no
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;
