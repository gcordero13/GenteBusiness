-- New hierarchy layer confirmed with the user: Proyecto -> Planificación ->
-- Tarea -> Subtarea. A "planificación" is structurally like a mini-project
-- (name + description) living inside a real project; every ROOT task
-- belongs to exactly one (sub-tasks don't pick their own - they inherit
-- their place in the hierarchy from their parent task). Same shape/RLS
-- pattern as plan_ciclos/plan_modulos (20261026100200), which this is
-- deliberately NOT built on top of: those are many-to-many tags a task can
-- have zero or several of, while this is a strict one-per-task container,
-- so reusing them would have meant stretching their semantics rather than
-- modeling what the user actually asked for.
create table public.plan_planificaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references public.app_users(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.plan_planificaciones enable row level security;

create policy "plan_planificaciones_select" on public.plan_planificaciones
  for select using (public.plan_can_see_proyecto(proyecto_id));

create policy "plan_planificaciones_write" on public.plan_planificaciones
  for all
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));

-- Nullable: existing tasks, and any task someone chooses not to file under
-- a planificación, stay valid - the UI encourages picking one on create
-- but nothing in the data model forces it.
alter table public.plan_tareas add column planificacion_id uuid references public.plan_planificaciones(id) on delete set null;

-- Re-issue the C3 column-grant (20261027090000, already extended once for
-- percent_complete/color in 20261027140000) to also cover planificacion_id.
revoke update on public.plan_tareas from authenticated;
grant update (
  title,
  description,
  estado_id,
  priority,
  labels,
  start_date,
  due_date,
  assignee_id,
  ciclo_id,
  sort_order,
  percent_complete,
  color,
  planificacion_id
) on public.plan_tareas to authenticated;

-- I1-style same-project validation, extending the two existing trigger
-- functions that already do this for estado_id/ciclo_id (insert path:
-- plan_set_tarea_ancestor_ids; update path: plan_validate_tarea_refs_on_update).
create or replace function public.plan_set_tarea_ancestor_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_row public.plan_tareas%rowtype;
begin
  if new.parent_task_id is null then
    new.ancestor_ids := '{}';
  else
    select * into parent_row from public.plan_tareas where id = new.parent_task_id;
    if not found then
      raise exception 'parent_task_id % no existe', new.parent_task_id;
    end if;
    if parent_row.proyecto_id <> new.proyecto_id then
      raise exception 'parent_task_id % pertenece a otro proyecto', new.parent_task_id;
    end if;
    new.ancestor_ids := parent_row.ancestor_ids || parent_row.id;
  end if;

  if new.estado_id is not null and not exists (
    select 1 from public.plan_estados e
    where e.id = new.estado_id and e.proyecto_id = new.proyecto_id
  ) then
    raise exception 'estado_id % no pertenece al proyecto %', new.estado_id, new.proyecto_id;
  end if;

  if new.ciclo_id is not null and not exists (
    select 1 from public.plan_ciclos c
    where c.id = new.ciclo_id and c.proyecto_id = new.proyecto_id
  ) then
    raise exception 'ciclo_id % no pertenece al proyecto %', new.ciclo_id, new.proyecto_id;
  end if;

  if new.planificacion_id is not null and not exists (
    select 1 from public.plan_planificaciones p
    where p.id = new.planificacion_id and p.proyecto_id = new.proyecto_id
  ) then
    raise exception 'planificacion_id % no pertenece al proyecto %', new.planificacion_id, new.proyecto_id;
  end if;

  return new;
end;
$$;

create or replace function public.plan_validate_tarea_refs_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado_id is not null
     and (new.estado_id is distinct from old.estado_id or new.proyecto_id is distinct from old.proyecto_id)
     and not exists (
       select 1 from public.plan_estados e
       where e.id = new.estado_id and e.proyecto_id = new.proyecto_id
     ) then
    raise exception 'estado_id % no pertenece al proyecto %', new.estado_id, new.proyecto_id;
  end if;

  if new.ciclo_id is not null
     and (new.ciclo_id is distinct from old.ciclo_id or new.proyecto_id is distinct from old.proyecto_id)
     and not exists (
       select 1 from public.plan_ciclos c
       where c.id = new.ciclo_id and c.proyecto_id = new.proyecto_id
     ) then
    raise exception 'ciclo_id % no pertenece al proyecto %', new.ciclo_id, new.proyecto_id;
  end if;

  if new.planificacion_id is not null
     and (new.planificacion_id is distinct from old.planificacion_id or new.proyecto_id is distinct from old.proyecto_id)
     and not exists (
       select 1 from public.plan_planificaciones p
       where p.id = new.planificacion_id and p.proyecto_id = new.proyecto_id
     ) then
    raise exception 'planificacion_id % no pertenece al proyecto %', new.planificacion_id, new.proyecto_id;
  end if;

  return new;
end;
$$;

drop trigger if exists plan_tareas_validate_refs_on_update on public.plan_tareas;
create trigger plan_tareas_validate_refs_on_update
  before update of estado_id, ciclo_id, planificacion_id, proyecto_id on public.plan_tareas
  for each row
  execute function public.plan_validate_tarea_refs_on_update();
