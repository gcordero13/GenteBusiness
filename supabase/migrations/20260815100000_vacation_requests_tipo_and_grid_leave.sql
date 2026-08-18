-- Distinguishes a vacation request from a personal-permission request - both
-- have rendered identically as "Permiso" everywhere in the app until now.
-- Defaulting to 'vacaciones' preserves today's behavior for every
-- already-approved request (this feature was originally built exclusively
-- for vacation time) and for any future insert that doesn't set it
-- explicitly.
alter table public.vacation_requests
  add column tipo text not null default 'vacaciones' check (tipo in ('vacaciones', 'permiso'));

-- Return shape is changing (new tipo column) - must drop before recreating,
-- see migration header comment.
drop function if exists public.get_ponchador_team_approved_leave(date, date);
drop function if exists public.get_ponchador_all_approved_leave(date, date);

-- Batch approved leave for the caller's downward reports_to_id chain, now
-- including tipo so the Vista general grid can color vacaciones/permiso
-- days differently.
create function public.get_ponchador_team_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date, tipo text)
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
    select vr.contact_id, vr.date_from, vr.date_to, vr.tipo
    from public.vacation_requests vr
    join public.get_ponchador_descendant_ids(my_contact_id) as t(id) on t.id = vr.contact_id
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;

-- Batch approved leave company-wide, same tipo addition, same can_manage
-- gating as before.
create function public.get_ponchador_all_approved_leave(p_period_start date, p_period_end date)
returns table (contact_id uuid, date_from date, date_to date, tipo text)
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
    select vr.contact_id, vr.date_from, vr.date_to, vr.tipo
    from public.vacation_requests vr
    where vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;
