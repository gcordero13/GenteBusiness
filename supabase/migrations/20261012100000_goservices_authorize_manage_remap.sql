-- Remaps which role_profile_permissions flag means what, for the
-- goservices module, to the standard flag names this codebase already uses
-- consistently elsewhere (can_authorize/can_manage), instead of the
-- previous ad-hoc can_view/can_add/can_edit split:
--   can_authorize = "gestor": sees every request, assigns an ejecutor,
--     changes any status, exports the full report.
--   can_manage    = "ejecutor": eligible to be assigned any request,
--     regardless of type (mantenimiento vs mensajería is now just an
--     organizational distinction via which role profile — e.g. the existing
--     UTILITY / Mensajeria profiles — grants can_manage, not a separate
--     code-level flag per type).
--   can_view/can_add/can_edit are no longer functionally used by this
--   module; creating a request remains open to every authenticated user
--   regardless of permission, unchanged.

-- Drops a column from an earlier, since-abandoned "single overwritable
-- note" design (superseded by the goservices_request_comments table added
-- in 20261010100000) that's live on production but no longer referenced by
-- any application code.
alter table public.goservices_requests drop column if exists status_note;

-- Give Super Admin (previously can_view=true for "gestor") the new
-- can_authorize flag instead, so it keeps full oversight under the new
-- mapping.
update public.role_profile_permissions rpp
set can_authorize = true
from public.modules m, public.role_profiles rp
where rpp.module_id = m.id
  and rpp.role_profile_id = rp.id
  and m.key = 'goservices'
  and rp.name = 'Super Admin';

-- Carry forward role profiles that were previously ejecutor-eligible under
-- the old can_add (mantenimiento)/can_edit (mensajería) split onto the new
-- single can_manage ejecutor flag, so assignment eligibility doesn't
-- silently disappear for them the moment this migration runs. Deliberately
-- requires BOTH flags (not either/or): on production today, "UTILITY" and
-- "Mensajeria" (the real, intended ejecutor profiles) have both can_add and
-- can_edit set, while "Viewer" only has can_add set — a misconfiguration
-- the human already flagged as a bug (ordinary viewers were incorrectly
-- showing up as assignment candidates). Using AND here carries the real
-- ejecutor profiles forward while correctly NOT re-granting Viewer
-- can_manage, fixing that bug as a side effect instead of reintroducing it.
update public.role_profile_permissions rpp
set can_manage = true
from public.modules m
where rpp.module_id = m.id
  and m.key = 'goservices'
  and (rpp.can_add and rpp.can_edit);

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

drop policy if exists "goservices_requests_select" on public.goservices_requests;
create policy "goservices_requests_select" on public.goservices_requests
  for select
  using (
    requester_app_user_id = auth.uid()
    or assigned_app_user_id = auth.uid()
    or coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false)
  );

drop policy if exists "goservices_requests_update" on public.goservices_requests;
create policy "goservices_requests_update" on public.goservices_requests
  for update
  using (
    assigned_app_user_id = auth.uid()
    or coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false)
  )
  with check (
    assigned_app_user_id = auth.uid()
    or coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false)
  );

drop policy if exists "goservices_request_comments_select" on public.goservices_request_comments;
create policy "goservices_request_comments_select" on public.goservices_request_comments
  for select
  using (
    exists (
      select 1 from public.goservices_requests gr
      where gr.id = request_id
        and (
          gr.requester_app_user_id = auth.uid()
          or gr.assigned_app_user_id = auth.uid()
          or coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false)
        )
    )
  );

drop policy if exists "goservices_request_comments_insert" on public.goservices_request_comments;
create policy "goservices_request_comments_insert" on public.goservices_request_comments
  for insert
  with check (
    author_app_user_id = auth.uid()
    and exists (
      select 1 from public.goservices_requests gr
      where gr.id = request_id
        and (
          gr.assigned_app_user_id = auth.uid()
          or coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false)
        )
    )
  );
