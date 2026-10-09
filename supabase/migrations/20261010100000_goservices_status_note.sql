-- A free-text note the assigned ejecutor (or a gestor) can leave alongside
-- or independent of a status change — e.g. "falta una pieza, pendiente de
-- compra". Joins status/assigned_app_user_id in the "always mutable, same
-- authorization as a status change" bucket in the lock-transitions trigger,
-- rather than the frozen-after-creation content columns.
alter table public.goservices_requests
  add column status_note text;

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
    if new.status is distinct from 'recibido' or new.assigned_app_user_id is not null or new.status_note is not null then
      raise exception 'No se puede crear una solicitud con un estado, asignación o nota ya definida';
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

  if (new.status, new.assigned_app_user_id, new.status_note) is distinct from (old.status, old.assigned_app_user_id, old.status_note) then
    is_manager := coalesce((select can_view from public.get_my_module_permissions('goservices')), false);
    is_assignee := old.assigned_app_user_id = auth.uid();

    if is_manager then
      -- Gestor can set assignment, any status, and the note freely.
      null;
    elsif is_assignee and new.assigned_app_user_id is not distinct from old.assigned_app_user_id then
      -- The assigned ejecutor may move status forward within their allowed
      -- range (and/or set the note) but can never reassign the ticket —
      -- only a gestor closes (completado) a mantenimiento ticket or
      -- cancels either type; a mensajero may complete their own mensajería
      -- ticket directly. The note itself has no restriction beyond "you
      -- must be the assignee or a gestor to touch this row at all".
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
      raise exception 'No autorizado para cambiar el estado, la asignación o la nota de la solicitud';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;
