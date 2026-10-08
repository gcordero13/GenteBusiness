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

create or replace function public.can_view_goservices()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_users au
    join public.role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
    join public.modules m on m.id = rpp.module_id
    where au.id = auth.uid() and m.key = 'goservices' and rpp.can_view
  );
$$;

create policy "goservices_requests_select" on public.goservices_requests
  for select
  using (
    requester_app_user_id = auth.uid()
    or assigned_app_user_id = auth.uid()
    or public.can_view_goservices()
  );

create policy "goservices_requests_insert" on public.goservices_requests
  for insert
  with check (requester_app_user_id = auth.uid());

create policy "goservices_requests_update" on public.goservices_requests
  for update
  using (assigned_app_user_id = auth.uid() or public.can_view_goservices())
  with check (assigned_app_user_id = auth.uid() or public.can_view_goservices());
