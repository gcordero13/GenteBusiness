-- list_my_ponchador_team's and list_all_ponchador_contacts' RETURNS TABLE
-- shape is being extended (two new columns) - Postgres does not allow
-- CREATE OR REPLACE FUNCTION to change a function's return type/OUT
-- parameter list, so both must be dropped before being recreated (learned
-- the hard way with the "position" reserved-word issue in the previous
-- Ponchador migration - verify this one actually applies cleanly).
drop function if exists public.list_my_ponchador_team();
drop function if exists public.list_all_ponchador_contacts();

-- The caller's full downward reports_to_id chain (direct reports, their
-- reports, and so on) - restricted to active contacts with a ponchador code
-- assigned, so any selector/roster this feeds never offers someone with no
-- attendance data to show. Now also returns schedule_id/department_id,
-- needed by the Vista general roster to resolve each listed person's
-- effective schedule (the same fields get_ponchador_contact_summary already
-- returns for a single person).
create function public.list_my_ponchador_team()
returns table (id uuid, first_name text, last_name text, "position" text, schedule_id uuid, department_id uuid)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_contact_id uuid;
begin
  select c.id into my_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  if my_contact_id is null then
    return;
  end if;

  return query
    select c.id, c.first_name, c.last_name, c.position, c.schedule_id, c.department_id
    from public.contacts c
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = c.id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Every active contact with a ponchador code assigned - only returns rows if
-- the caller has can_manage on the ponchador module, empty otherwise. Now
-- also returns schedule_id/department_id, for the same reason as above.
create function public.list_all_ponchador_contacts()
returns table (id uuid, first_name text, last_name text, "position" text, department_name text, schedule_id uuid, department_id uuid)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  can_manage_all boolean;
begin
  select coalesce((select can_manage from public.get_my_module_permissions('ponchador')), false)
  into can_manage_all;

  if not can_manage_all then
    return;
  end if;

  return query
    select c.id, c.first_name, c.last_name, c.position, d.name as department_name, c.schedule_id, c.department_id
    from public.contacts c
    left join public.departments d on d.id = c.department_id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Batch punches for every contact in the caller's downward reports_to_id
-- chain, within the window - one call instead of one-per-person, so a
-- roster of N people costs O(1) round trips, not O(N). Reuses
-- get_ponchador_descendant_ids - no new hierarchy logic.
create or replace function public.get_ponchador_team_punches(p_from timestamptz, p_to timestamptz)
returns table (contact_id uuid, punched_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_contact_id uuid;
begin
  select c.id into my_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  if my_contact_id is null then
    return;
  end if;

  return query
    select tcp.contact_id, tcp.punched_at
    from public.time_clock_punches tcp
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = tcp.contact_id
    where tcp.punched_at >= p_from and tcp.punched_at < p_to;
end;
$$;

-- Batch approved leave for the same downward chain, same reasoning.
create or replace function public.get_ponchador_team_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_contact_id uuid;
begin
  select c.id into my_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  if my_contact_id is null then
    return;
  end if;

  return query
    select vr.contact_id, vr.date_from, vr.date_to
    from public.vacation_requests vr
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = vr.contact_id
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;

-- Batch punches for every contact company-wide - gated by can_manage on the
-- ponchador module, empty otherwise, same convention as
-- list_all_ponchador_contacts.
create or replace function public.get_ponchador_all_punches(p_from timestamptz, p_to timestamptz)
returns table (contact_id uuid, punched_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  can_manage_all boolean;
begin
  select coalesce((select can_manage from public.get_my_module_permissions('ponchador')), false)
  into can_manage_all;

  if not can_manage_all then
    return;
  end if;

  return query
    select tcp.contact_id, tcp.punched_at
    from public.time_clock_punches tcp
    where tcp.punched_at >= p_from and tcp.punched_at < p_to;
end;
$$;

-- Batch approved leave company-wide, same gating.
create or replace function public.get_ponchador_all_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  can_manage_all boolean;
begin
  select coalesce((select can_manage from public.get_my_module_permissions('ponchador')), false)
  into can_manage_all;

  if not can_manage_all then
    return;
  end if;

  return query
    select vr.contact_id, vr.date_from, vr.date_to
    from public.vacation_requests vr
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;
