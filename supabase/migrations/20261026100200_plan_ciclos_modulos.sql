-- Named "plan_ciclos"/"plan_modulos" (not "ciclos"/"modulos") to avoid any
-- confusion with the existing public.modules table that drives this app's
-- entire role-profile permission system - unrelated concept, same word.
create table public.plan_ciclos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.plan_modulos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.plan_ciclos enable row level security;
alter table public.plan_modulos enable row level security;

create policy "plan_ciclos_select" on public.plan_ciclos
  for select using (public.plan_can_see_proyecto(proyecto_id));
create policy "plan_ciclos_write" on public.plan_ciclos
  for all using (public.plan_can_edit_proyecto(proyecto_id)) with check (public.plan_can_edit_proyecto(proyecto_id));

create policy "plan_modulos_select" on public.plan_modulos
  for select using (public.plan_can_see_proyecto(proyecto_id));
create policy "plan_modulos_write" on public.plan_modulos
  for all using (public.plan_can_edit_proyecto(proyecto_id)) with check (public.plan_can_edit_proyecto(proyecto_id));
