-- Fase 1 de "Solicitudes de Permisos": el módulo dejó de ser exclusivo de
-- vacaciones. Amplía tipo a los 7 tipos que reconoce la empresa (ver
-- infográfico interno "Solicitud de Permisos y Vacaciones"), permite un
-- documento adjunto opcional, y le da al detalle individual del Ponchador
-- la misma distinción vacaciones/permiso que la Vista general ya tenía.

-- 1. Migra cualquier fila existente con el viejo tipo genérico 'permiso' a
--    'otro' ANTES de ampliar el constraint - 'permiso' deja de ser un valor
--    válido, así que debe hacerse en este orden o el ALTER CONSTRAINT de
--    abajo fallaría contra filas ya no conformes.
update public.vacation_requests set tipo = 'otro' where tipo = 'permiso';

-- 2. Amplía el check constraint de tipo a los 7 valores reconocidos.
alter table public.vacation_requests drop constraint vacation_requests_tipo_check;
alter table public.vacation_requests
  add constraint vacation_requests_tipo_check
  check (tipo in ('vacaciones', 'personal', 'familiar', 'medico', 'perdida', 'tramites', 'otro'));

-- 3. days_requested/return_date solo tienen sentido para tipo='vacaciones'
--    (balance de días) - los otros 6 tipos usan un formulario simple sin
--    estos campos.
alter table public.vacation_requests alter column days_requested drop not null;
alter table public.vacation_requests alter column return_date drop not null;

-- 4. Dónde guardar un documento de soporte opcional (ej. comprobante
--    médico) - una ruta de Storage, mismo patrón que las firmas de
--    aprobación (supervisor_signature_path/rrhh_signature_path).
alter table public.vacation_requests add column attachment_path text;

-- 5. attachment_path es un campo de contenido que define quien solicita,
--    con el mismo ciclo de vida que notes/tipo (se fija una vez al enviar
--    la solicitud y queda inmutable después) - debe agregarse a las dos
--    tuplas de inmutabilidad en enforce_vacation_requests_transitions, por
--    la misma razón ya documentada ahí para tipo
--    (20260815100000_vacation_requests_tipo_and_grid_leave.sql): si no se
--    agrega, un jefe directo o RRHH podría cambiar silenciosamente el
--    adjunto al mismo tiempo que registra su decisión. Mismo cuerpo que la
--    versión actual, solo se agrega attachment_path a ambas tuplas.
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
      new.created_at, new.tipo, new.attachment_path
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.tipo, old.attachment_path
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
      new.supervisor_signature_path, new.tipo, new.attachment_path
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.supervisor_decision, old.supervisor_decided_at, old.supervisor_comments,
      old.supervisor_signature_path, old.tipo, old.attachment_path
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

-- 6. Bucket nuevo para el documento de soporte opcional, mismo patrón
--    bloqueado que vacation-request-signatures: cero políticas en
--    storage.objects deniega anon/authenticated por completo. Solo el
--    cliente admin (usado por createVacationRequest tras sus propias
--    validaciones de aplicación) puede escribirlo, y solo se lee mediante
--    URLs firmadas generadas en el servidor.
insert into storage.buckets (id, name, public)
values ('vacation-request-attachments', 'vacation-request-attachments', false)
on conflict (id) do nothing;

-- 7. get_ponchador_approved_leave (detalle individual del Ponchador) nunca
--    devolvía tipo, así que cualquier solicitud aprobada - vacaciones o
--    cualquier tipo de permiso - se mostraba siempre como el mismo estado
--    genérico "Permiso aprobado". Se le agrega tipo, mismo cambio ya hecho
--    a get_ponchador_team_approved_leave/get_ponchador_all_approved_leave
--    en 20260815100000_vacation_requests_tipo_and_grid_leave.sql. El shape
--    de retorno cambia, así que hay que hacer drop antes de recrear (misma
--    razón que esa migración).
drop function if exists public.get_ponchador_approved_leave(uuid, date, date);

create function public.get_ponchador_approved_leave(p_contact_id uuid, p_period_start date, p_period_end date)
returns table (date_from date, date_to date, tipo text)
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
    select vr.date_from, vr.date_to, vr.tipo
    from public.vacation_requests vr
    where vr.contact_id = p_contact_id
      and vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;
