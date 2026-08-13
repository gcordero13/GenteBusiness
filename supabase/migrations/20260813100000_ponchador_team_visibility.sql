-- Central check reused by every Ponchador cross-person data function below:
-- can the caller view p_contact_id's Ponchador? Yes if it's their own
-- contact, if they have can_manage on the ponchador module, or if
-- p_contact_id is found anywhere in their downward reports_to_id chain (not
-- just direct reports - the full chain, however many levels deep).
create or replace function public.can_view_ponchador_contact(p_contact_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  my_contact_id uuid;
  can_manage_all boolean;
begin
  select c.id into my_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  if my_contact_id is null then
    return false;
  end if;

  if p_contact_id = my_contact_id then
    return true;
  end if;

  select coalesce((select can_manage from public.get_my_module_permissions('ponchador')), false)
  into can_manage_all;

  if can_manage_all then
    return true;
  end if;

  return exists (
    with recursive descendants as (
      select cc.id from public.contacts cc where cc.reports_to_id = my_contact_id
      union all
      select cc.id from public.contacts cc
      join descendants d on cc.reports_to_id = d.id
    )
    select 1 from descendants where id = p_contact_id
  );
end;
$$;

create or replace function public.get_ponchador_contact_summary(p_contact_id uuid)
returns table (
  first_name text,
  last_name text,
  schedule_id uuid,
  department_id uuid,
  hikvision_employee_no text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select c.first_name, c.last_name, c.schedule_id, c.department_id, c.hikvision_employee_no
    from public.contacts c
    where c.id = p_contact_id;
end;
$$;

create or replace function public.get_ponchador_punches(p_contact_id uuid, p_from timestamptz, p_to timestamptz)
returns table (punched_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select tcp.punched_at
    from public.time_clock_punches tcp
    where tcp.contact_id = p_contact_id
      and tcp.punched_at >= p_from
      and tcp.punched_at < p_to;
end;
$$;

create or replace function public.get_ponchador_approved_leave(p_contact_id uuid, p_period_start date, p_period_end date)
returns table (date_from date, date_to date)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select vr.date_from, vr.date_to
    from public.vacation_requests vr
    where vr.contact_id = p_contact_id
      and vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;

-- The caller's full downward reports_to_id chain (direct reports, their
-- reports, and so on) - restricted to active contacts with a ponchador code
-- assigned, so the selector this feeds never offers someone with no
-- attendance data to show.
create or replace function public.list_my_ponchador_team()
returns table (id uuid, first_name text, last_name text, position text)
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
    with recursive descendants as (
      select cc.id from public.contacts cc where cc.reports_to_id = my_contact_id
      union all
      select cc.id from public.contacts cc
      join descendants d on cc.reports_to_id = d.id
    )
    select c.id, c.first_name, c.last_name, c.position
    from public.contacts c
    join descendants d on d.id = c.id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Every active contact with a ponchador code assigned - only returns rows if
-- the caller has can_manage on the ponchador module, empty otherwise.
create or replace function public.list_all_ponchador_contacts()
returns table (id uuid, first_name text, last_name text, position text, department_name text)
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
    select c.id, c.first_name, c.last_name, c.position, d.name as department_name
    from public.contacts c
    left join public.departments d on d.id = c.department_id
    where c.status = 'active' and c.hikvision_employee_no is not null;
end;
$$;

-- Grant "Todos" visibility to Super Admin by default, same as can_view was
-- granted to Super Admin when the ponchador module was first created.
update public.role_profile_permissions rpp
set can_manage = true
from public.role_profiles rp, public.modules m
where rpp.role_profile_id = rp.id
  and rpp.module_id = m.id
  and m.key = 'ponchador'
  and rp.name = 'Super Admin';
