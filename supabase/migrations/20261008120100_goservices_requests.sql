create table public.goservices_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  request_type text not null check (request_type in ('mantenimiento', 'mensajeria')),

  requester_app_user_id uuid not null references public.app_users (id),
  requester_contact_id uuid references public.contacts (id),
  requester_name text not null,

  ubicacion text check (ubicacion in ('oficina', 'alojamiento')),
  categoria text check (categoria in ('cerrajeria', 'mobiliario', 'instalaciones_electricas', 'plomeria', 'infraestructura')),
  subcategoria text,

  tipo_mensajeria text check (tipo_mensajeria in ('envio', 'retiro', 'compras', 'traslados')),
  contacto_nombre text,
  contacto_telefono text,
  contacto_direccion text,

  detalle text not null,
  foto_url text,
  documento_url text,

  status text not null default 'recibido' check (status in ('recibido', 'en_proceso', 'completado', 'cancelado')),
  assigned_app_user_id uuid references public.app_users (id),

  check (
    (request_type = 'mantenimiento' and ubicacion is not null and categoria is not null and tipo_mensajeria is null)
    or
    (request_type = 'mensajeria' and tipo_mensajeria is not null and ubicacion is null and categoria is null)
  )
);

create index goservices_requests_requester_idx on public.goservices_requests (requester_app_user_id);
create index goservices_requests_assigned_idx on public.goservices_requests (assigned_app_user_id);

alter table public.goservices_requests enable row level security;

-- RLS on goservices_requests only pins "who" (requester/assignee/can_view
-- identity) on each policy's WITH CHECK — it can't express "old vs new"
-- column diffing, so a caller could otherwise smuggle an already-assigned
-- or already-resolved request at insert time (self-granting standing
-- update rights via assigned_app_user_id), or rewrite the request's content
-- after creation. This trigger closes that gap, matching the
-- enforce_vacation_requests_transitions precedent in
-- 20260801160150_vacation_requests_lock_transitions.sql. It also maintains
-- updated_at, mirroring how enforce_contacts_update_permissions folds that
-- into its own permission-enforcing trigger (no standalone generic
-- updated_at trigger function exists elsewhere in this codebase to reuse).
create or replace function public.enforce_goservices_requests_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    new.ubicacion, new.categoria, new.subcategoria, new.tipo_mensajeria,
    new.contacto_nombre, new.contacto_telefono, new.contacto_direccion,
    new.detalle, new.foto_url, new.documento_url, new.created_at
  ) is distinct from (
    old.request_type, old.requester_app_user_id, old.requester_contact_id, old.requester_name,
    old.ubicacion, old.categoria, old.subcategoria, old.tipo_mensajeria,
    old.contacto_nombre, old.contacto_telefono, old.contacto_direccion,
    old.detalle, old.foto_url, old.documento_url, old.created_at
  ) then
    raise exception 'No se pueden modificar los datos de la solicitud luego de creada';
  end if;

  if (new.status, new.assigned_app_user_id) is distinct from (old.status, old.assigned_app_user_id) then
    if not (
      old.assigned_app_user_id = auth.uid()
      or coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
    ) then
      raise exception 'No autorizado para cambiar el estado o la asignación de la solicitud';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger goservices_requests_lock_transitions
before insert or update on public.goservices_requests
for each row execute function public.enforce_goservices_requests_transitions();

create policy "goservices_requests_select" on public.goservices_requests
  for select
  using (
    requester_app_user_id = auth.uid()
    or assigned_app_user_id = auth.uid()
    or coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
  );

create policy "goservices_requests_insert" on public.goservices_requests
  for insert
  with check (requester_app_user_id = auth.uid());

create policy "goservices_requests_update" on public.goservices_requests
  for update
  using (
    assigned_app_user_id = auth.uid()
    or coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
  )
  with check (
    assigned_app_user_id = auth.uid()
    or coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
  );
