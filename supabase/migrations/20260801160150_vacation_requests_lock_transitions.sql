-- RLS on vacation_requests only pins "who" (requester/supervisor/RRHH identity)
-- on each policy's WITH CHECK — it can't express "old vs new" column diffing,
-- so a caller could otherwise smuggle an already-decided status, fabricate a
-- decision at the wrong stage, or forge who signed off. This trigger closes
-- that gap, matching the enforce_contacts_update_permissions precedent in
-- 20260715120543_per_module_permissions.sql.
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
      new.created_at
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at
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
      new.supervisor_signature_path
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.supervisor_decision, old.supervisor_decided_at, old.supervisor_comments,
      old.supervisor_signature_path
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

create trigger vacation_requests_lock_transitions
before insert or update on public.vacation_requests
for each row execute function public.enforce_vacation_requests_transitions();
