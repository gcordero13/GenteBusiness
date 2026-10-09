-- Attachment SharePoint drive/item ids (so a server-side proxy can fetch a
-- fresh, short-lived Graph download URL on demand instead of storing one
-- directly, which would expire).
alter table public.goservices_requests
  add column foto_drive_id text,
  add column foto_item_id text,
  add column documento_drive_id text,
  add column documento_item_id text;

-- Snapshotted at submission time (same reasoning as vacation_requests'
-- first_name/last_name/department_name snapshots) for display in the
-- status-change notification email and the request detail view.
alter table public.goservices_requests
  add column requester_department_name text;

-- A human-friendly sequential ticket number for display (the id column
-- remains the real primary key) — same pattern as complaints.complaint_number.
alter table public.goservices_requests
  add column request_number bigint generated always as identity;

-- can_add on the goservices module now means "eligible to be assigned a
-- request" (ejecutor), reusing the existing role_profile_permissions column
-- rather than a new table. Give Super Admin this by default so the feature
-- is testable immediately with the one role profile the original migration
-- already granted can_view to.
update public.role_profile_permissions rpp
set can_add = true
from public.modules m, public.role_profiles rp
where rpp.module_id = m.id
  and rpp.role_profile_id = rp.id
  and m.key = 'goservices'
  and rp.name = 'Super Admin';

-- New intermediate status: for mantenimiento, the assigned ejecutor (Utility)
-- can mark their work "finalizado_ejecutor", but only a gestor (can_view)
-- can actually close the ticket as "completado". Mensajería has no such
-- intermediate step — the assigned ejecutor (Mensajero) can complete it
-- directly. "cancelado" is gestor-only for both types.
alter table public.goservices_requests
  drop constraint if exists goservices_requests_status_check;

alter table public.goservices_requests
  add constraint goservices_requests_status_check
  check (status in ('recibido', 'en_proceso', 'finalizado_ejecutor', 'completado', 'cancelado'));

-- Replaces the original transition-locking trigger with type/role-dependent
-- status rules. Content-column lock is unchanged in spirit but now also
-- covers requester_department_name and the four new attachment id columns
-- (previously locked foto_url/documento_url already covered the public-
-- facing attachment URL; the drive/item ids are the same kind of
-- write-once metadata and must be locked the same way).
create or replace function public.enforce_goservices_requests_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_manager boolean;
  is_assignee boolean;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'recibido' or new.assigned_app_user_id is not null then
      raise exception 'No se puede crear una solicitud con un estado o asignación ya definida';
    end if;

    return new;
  end if;

  -- tg_op = 'UPDATE' from here on.

  if (
    new.request_type, new.requester_app_user_id, new.requester_contact_id, new.requester_name,
    new.requester_department_name, new.ubicacion, new.categoria, new.subcategoria, new.tipo_mensajeria,
    new.contacto_nombre, new.contacto_telefono, new.contacto_direccion,
    new.detalle, new.foto_url, new.documento_url,
    new.foto_drive_id, new.foto_item_id, new.documento_drive_id, new.documento_item_id,
    new.created_at
  ) is distinct from (
    old.request_type, old.requester_app_user_id, old.requester_contact_id, old.requester_name,
    old.requester_department_name, old.ubicacion, old.categoria, old.subcategoria, old.tipo_mensajeria,
    old.contacto_nombre, old.contacto_telefono, old.contacto_direccion,
    old.detalle, old.foto_url, old.documento_url,
    old.foto_drive_id, old.foto_item_id, old.documento_drive_id, old.documento_item_id,
    old.created_at
  ) then
    raise exception 'No se pueden modificar los datos de la solicitud luego de creada';
  end if;

  if (new.status, new.assigned_app_user_id) is distinct from (old.status, old.assigned_app_user_id) then
    is_manager := coalesce((select can_view from public.get_my_module_permissions('goservices')), false);
    is_assignee := old.assigned_app_user_id = auth.uid();

    if is_manager then
      -- Gestor can set assignment and any status freely.
      null;
    elsif is_assignee and new.assigned_app_user_id is not distinct from old.assigned_app_user_id then
      -- The assigned ejecutor may move status forward within their allowed
      -- range but can never reassign the ticket or cancel it — only a
      -- gestor closes (completado) a mantenimiento ticket or cancels
      -- either type; a mensajero may complete their own mensajería ticket
      -- directly.
      if old.request_type = 'mantenimiento' then
        if new.status not in ('en_proceso', 'finalizado_ejecutor') then
          raise exception 'Un ejecutor de mantenimiento solo puede marcar "En proceso" o "Finalizado por ejecutor" — solo el supervisor puede completar o cancelar';
        end if;
      else
        if new.status not in ('en_proceso', 'completado') then
          raise exception 'Un mensajero solo puede marcar "En proceso" o "Completado" — solo el supervisor puede cancelar';
        end if;
      end if;
    else
      raise exception 'No autorizado para cambiar el estado o la asignación de la solicitud';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;
