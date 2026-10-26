-- Root container of the new Plane-inspired Proyectos system. Any
-- authenticated user can create one (no role-profile gate, unlike every
-- other module in this app - confirmed explicitly with the user: access
-- here is controlled by ownership/sharing, not by Perfiles de rol).
create table public.plan_proyectos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.app_users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Sharing the whole project is equivalent to sharing its entire task tree.
create table public.plan_proyecto_compartidos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  shared_with_app_user_id uuid not null references public.app_users(id) on delete cascade,
  access_level text not null check (access_level in ('ver', 'editar')),
  shared_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (proyecto_id, shared_with_app_user_id)
);

alter table public.plan_proyectos enable row level security;
alter table public.plan_proyecto_compartidos enable row level security;

-- Core visibility functions, reused by every plan_* table's RLS so the
-- rule lives in exactly one place instead of being re-derived per table
-- (the risk flagged in this plan's own self-review: drift between
-- policies). SECURITY DEFINER so they can read plan_proyectos/
-- plan_proyecto_compartidos regardless of the calling role's own RLS
-- visibility of those rows (otherwise checking visibility would require
-- already having visibility - a chicken-and-egg problem).
create or replace function public.plan_can_see_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plan_proyectos p
    where p.id = p_proyecto_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1 from public.plan_proyecto_compartidos pc
          where pc.proyecto_id = p.id and pc.shared_with_app_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.plan_can_edit_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plan_proyectos p
    where p.id = p_proyecto_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1 from public.plan_proyecto_compartidos pc
          where pc.proyecto_id = p.id and pc.shared_with_app_user_id = auth.uid() and pc.access_level = 'editar'
        )
      )
  );
$$;

create policy "plan_proyectos_select" on public.plan_proyectos
  for select
  using (public.plan_can_see_proyecto(id));

create policy "plan_proyectos_insert" on public.plan_proyectos
  for insert
  with check (created_by = auth.uid());

create policy "plan_proyectos_update" on public.plan_proyectos
  for update
  using (public.plan_can_edit_proyecto(id))
  with check (public.plan_can_edit_proyecto(id));

-- Deleting a whole project is more destructive than editing it - restricted
-- to the creator only, not to every editar-level share holder.
create policy "plan_proyectos_delete" on public.plan_proyectos
  for delete
  using (created_by = auth.uid());

create policy "plan_proyecto_compartidos_select" on public.plan_proyecto_compartidos
  for select
  using (public.plan_can_see_proyecto(proyecto_id));

-- Sharing/revoking requires editar access to the project - a ver-only
-- recipient cannot grant access to others (an explicit, deliberate
-- interpretation of "delegable sharing": delegation requires meaningful
-- access, not mere visibility).
create policy "plan_proyecto_compartidos_write" on public.plan_proyecto_compartidos
  for all
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));
