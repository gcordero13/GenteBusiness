-- Per-project custom status columns (not a fixed company-wide enum like
-- GoServices/Servicios Generales use) - confirmed with the user, closer
-- to real Plane's per-project workflow states.
create table public.plan_estados (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0
);

alter table public.plan_estados enable row level security;

create policy "plan_estados_select" on public.plan_estados
  for select
  using (public.plan_can_see_proyecto(proyecto_id));

create policy "plan_estados_write" on public.plan_estados
  for all
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));
