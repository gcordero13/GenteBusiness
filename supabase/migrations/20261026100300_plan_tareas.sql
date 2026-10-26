create table public.plan_tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  parent_task_id uuid references public.plan_tareas(id) on delete cascade,
  ancestor_ids uuid[] not null default '{}',
  title text not null,
  description text,
  estado_id uuid references public.plan_estados(id),
  priority text check (priority in ('alta', 'media', 'baja')),
  labels text[] not null default '{}',
  start_date date,
  due_date date,
  assignee_id uuid references public.app_users(id),
  ciclo_id uuid references public.plan_ciclos(id),
  created_by uuid not null references public.app_users(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index plan_tareas_ancestor_ids_idx on public.plan_tareas using gin (ancestor_ids);
create index plan_tareas_proyecto_id_idx on public.plan_tareas (proyecto_id);
create index plan_tareas_parent_task_id_idx on public.plan_tareas (parent_task_id);

-- Maintains ancestor_ids automatically: a child always inherits its
-- parent's full ancestor_ids plus the parent's own id. Runs BEFORE INSERT
-- so sharing visibility (which reads ancestor_ids) is correct from the
-- very first row. App code passes parent_task_id; it never computes
-- ancestor_ids itself (the only source of truth is this trigger).
create or replace function public.plan_set_tarea_ancestor_ids()
returns trigger
language plpgsql
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
    new.ancestor_ids := parent_row.ancestor_ids || parent_row.id;
  end if;
  return new;
end;
$$;

create trigger plan_tareas_set_ancestor_ids
  before insert on public.plan_tareas
  for each row
  execute function public.plan_set_tarea_ancestor_ids();

alter table public.plan_tareas enable row level security;

-- A task is visible if its project is visible at all (owner or any share
-- level), OR the caller owns/is assigned to the task directly, OR the
-- task itself (or any ancestor, via the materialized array) was shared
-- with the caller. Ownership/assignment always wins regardless of any
-- inherited ver-level share - checked directly here, not derived from a
-- share row, so it can never be weakened by a share's access_level.
create or replace function public.plan_can_see_tarea(p_tarea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.plan_tareas t
    where t.id = p_tarea_id
      and (
        public.plan_can_see_proyecto(t.proyecto_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
        )
      )
  );
$$;

create or replace function public.plan_can_edit_tarea(p_tarea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.plan_tareas t
    where t.id = p_tarea_id
      and (
        public.plan_can_edit_proyecto(t.proyecto_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
            and tc.access_level = 'editar'
        )
      )
  );
$$;

create policy "plan_tareas_select" on public.plan_tareas
  for select
  using (public.plan_can_see_tarea(id));

-- Creating a root task (no parent) requires editar on the project;
-- creating a child requires editar on the parent task specifically (not
-- just "somewhere in the project"), so a ver-only project share, or a
-- share scoped to a sibling branch, can't be used to add tasks under a
-- branch the caller doesn't actually have edit rights to.
create policy "plan_tareas_insert" on public.plan_tareas
  for insert
  with check (
    created_by = auth.uid()
    and (
      (parent_task_id is null and public.plan_can_edit_proyecto(proyecto_id))
      or (parent_task_id is not null and public.plan_can_edit_tarea(parent_task_id))
    )
  );

create policy "plan_tareas_update" on public.plan_tareas
  for update
  using (public.plan_can_edit_tarea(id))
  with check (public.plan_can_edit_tarea(id));

create policy "plan_tareas_delete" on public.plan_tareas
  for delete
  using (public.plan_can_edit_tarea(id));

create table public.plan_tarea_modulos (
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  modulo_id uuid not null references public.plan_modulos(id) on delete cascade,
  primary key (tarea_id, modulo_id)
);
alter table public.plan_tarea_modulos enable row level security;
create policy "plan_tarea_modulos_select" on public.plan_tarea_modulos
  for select using (public.plan_can_see_tarea(tarea_id));
create policy "plan_tarea_modulos_write" on public.plan_tarea_modulos
  for all using (public.plan_can_edit_tarea(tarea_id)) with check (public.plan_can_edit_tarea(tarea_id));

-- Sharing/revoking a task requires editar on it - same "delegation
-- requires meaningful access" rule as plan_proyecto_compartidos_write.
create table public.plan_tarea_compartidos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  shared_with_app_user_id uuid not null references public.app_users(id) on delete cascade,
  access_level text not null check (access_level in ('ver', 'editar')),
  shared_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (tarea_id, shared_with_app_user_id)
);
alter table public.plan_tarea_compartidos enable row level security;
create policy "plan_tarea_compartidos_select" on public.plan_tarea_compartidos
  for select using (public.plan_can_see_tarea(tarea_id));
create policy "plan_tarea_compartidos_write" on public.plan_tarea_compartidos
  for all using (public.plan_can_edit_tarea(tarea_id)) with check (public.plan_can_edit_tarea(tarea_id));

create table public.plan_tarea_adjuntos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  file_name text not null,
  content_type text,
  drive_id text not null,
  item_id text not null,
  uploaded_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);
alter table public.plan_tarea_adjuntos enable row level security;
create policy "plan_tarea_adjuntos_select" on public.plan_tarea_adjuntos
  for select using (public.plan_can_see_tarea(tarea_id));
create policy "plan_tarea_adjuntos_write" on public.plan_tarea_adjuntos
  for all using (public.plan_can_edit_tarea(tarea_id)) with check (public.plan_can_edit_tarea(tarea_id));
