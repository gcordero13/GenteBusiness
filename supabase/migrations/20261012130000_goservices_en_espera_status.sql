-- Adds a new "en_espera" (on hold) status to GoServices requests — an
-- ejecutor can pause a ticket after "En proceso" (e.g. waiting on a part or
-- on the requester) and later resume it, for both mantenimiento and
-- mensajería. Confirmed with the user: only reachable from "en_proceso",
-- applies to both request types, gestor keeps unrestricted access to any
-- status as before.

alter table public.goservices_requests
  drop constraint if exists goservices_requests_status_check;

alter table public.goservices_requests
  add constraint goservices_requests_status_check
  check (status in ('recibido', 'en_proceso', 'en_espera', 'finalizado_ejecutor', 'completado', 'cancelado'));

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
    is_manager := coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false);
    is_assignee := old.assigned_app_user_id = auth.uid();

    if is_manager then
      -- Gestor can set assignment and any status freely.
      null;
    elsif is_assignee and new.assigned_app_user_id is not distinct from old.assigned_app_user_id then
      if old.request_type = 'mantenimiento' then
        if new.status not in ('en_proceso', 'en_espera', 'finalizado_ejecutor') then
          raise exception 'Un ejecutor de mantenimiento solo puede marcar "En proceso", "En espera" o "Finalizado por ejecutor" — solo el supervisor puede completar o cancelar';
        end if;
      else
        if new.status not in ('en_proceso', 'en_espera', 'completado') then
          raise exception 'Un mensajero solo puede marcar "En proceso", "En espera" o "Completado" — solo el supervisor puede cancelar';
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
