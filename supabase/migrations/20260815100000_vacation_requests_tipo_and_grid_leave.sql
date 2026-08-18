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

-- RLS's WITH CHECK on the supervisor/RRHH update policies only verifies who
-- is updating, not which columns changed - enforce_vacation_requests_transitions
-- (20260801160150_vacation_requests_lock_transitions.sql) closes that gap by
-- enumerating every requester-owned content field in two immutability
-- tuples. tipo is exactly that kind of requester-set content field (set
-- once at submission, same lifecycle as notes/period/dates), so it must be
-- added to both tuples - otherwise an authenticated supervisor/RRHH update
-- could silently smuggle a tipo change alongside their legitimate decision
-- fields. Same signature as the original function; only the two tuples
-- change.
create or replace function public.enforce_vacation_requests_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (
      new.status is distinct from 'pendiente_supervisor'
      or new.supervisor_decision is not null
      or new.supervisor_decided_at is not null
      or new.supervisor_comments is not null
      or new.supervisor_signature_path is not null
      or new.rrhh_decision is not null
      or new.rrhh_decided_at is not null
      or new.rrhh_decided_by is not null
      or new.rrhh_comments is not null
      or new.rrhh_signature_path is not null
      or new.rrhh_period_confirmed is not null
      or new.rrhh_has_current_vacation is not null
      or new.rrhh_is_advance is not null
    ) then
      raise exception 'No se puede crear una solicitud con un estado o decisión ya definida';
    end if;

    return new;
  end if;

  -- tg_op = 'UPDATE' from here on.

  if old.status = 'pendiente_supervisor' then
    if (
      new.contact_id, new.requester_app_user_id, new.first_name, new.last_name, new.position,
      new.company_name, new.department_name, new.period, new.days_requested, new.date_from,
      new.date_to, new.return_date, new.days_pending, new.notes, new.supervisor_app_user_id,
      new.created_at, new.tipo
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.tipo
    ) then
      raise exception 'Transición de solicitud inválida en la etapa del jefe directo';
    end if;

    if (
      new.rrhh_decision, new.rrhh_decided_at, new.rrhh_decided_by, new.rrhh_comments,
      new.rrhh_signature_path, new.rrhh_period_confirmed, new.rrhh_has_current_vacation,
      new.rrhh_is_advance
    ) is distinct from (
      old.rrhh_decision, old.rrhh_decided_at, old.rrhh_decided_by, old.rrhh_comments,
      old.rrhh_signature_path, old.rrhh_period_confirmed, old.rrhh_has_current_vacation,
      old.rrhh_is_advance
    ) then
      raise exception 'Transición de solicitud inválida en la etapa del jefe directo';
    end if;

    if new.status = 'rechazado' and new.supervisor_decision = 'rechazado' then
      return new;
    elsif new.status = 'pendiente_rrhh' and new.supervisor_decision = 'aprobado' then
      return new;
    else
      raise exception 'Transición de solicitud inválida en la etapa del jefe directo';
    end if;
  end if;

  if old.status = 'pendiente_rrhh' then
    if new.rrhh_decided_by is distinct from auth.uid() then
      raise exception 'Transición de solicitud inválida en la etapa de RRHH';
    end if;

    if (
      new.contact_id, new.requester_app_user_id, new.first_name, new.last_name, new.position,
      new.company_name, new.department_name, new.period, new.days_requested, new.date_from,
      new.date_to, new.return_date, new.days_pending, new.notes, new.supervisor_app_user_id,
      new.created_at, new.supervisor_decision, new.supervisor_decided_at, new.supervisor_comments,
      new.supervisor_signature_path, new.tipo
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.supervisor_decision, old.supervisor_decided_at, old.supervisor_comments,
      old.supervisor_signature_path, old.tipo
    ) then
      raise exception 'Transición de solicitud inválida en la etapa de RRHH';
    end if;

    if new.status = 'rechazado' and new.rrhh_decision = 'rechazado' then
      return new;
    elsif new.status = 'aprobado' and new.rrhh_decision = 'aprobado' then
      return new;
    else
      raise exception 'Transición de solicitud inválida en la etapa de RRHH';
    end if;
  end if;

  -- old.status in ('aprobado', 'rechazado'): no edit-after-decision flow exists.
  raise exception 'No se puede modificar una solicitud ya finalizada';
end;
$$;
