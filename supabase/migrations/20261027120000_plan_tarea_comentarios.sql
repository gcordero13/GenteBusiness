-- Comments on a task - confirmed with the user ("quiero... poder
-- comentar en la tarea"). Append-only (no update/delete policy), same
-- spirit as POA's progress log elsewhere in this app: a comment is a
-- permanent log entry, not an editable document. Anyone who can SEE the
-- task (owner, assignee, or cascaded via a project/task share) can
-- comment on it - comments don't need their own separate sharing concept.
create table public.plan_tarea_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  body text not null,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);
create index plan_tarea_comentarios_tarea_id_idx on public.plan_tarea_comentarios (tarea_id);

alter table public.plan_tarea_comentarios enable row level security;

-- Not self-referential (plan_can_see_tarea queries plan_tareas, a
-- different, already-existing table), so a chained .select() after
-- .insert() is safe here - unlike plan_proyectos/plan_tareas themselves,
-- this isn't affected by the RETURNING/MVCC-visibility issue fixed
-- earlier for those two tables.
create policy "plan_tarea_comentarios_select" on public.plan_tarea_comentarios
  for select using (public.plan_can_see_tarea(tarea_id));

create policy "plan_tarea_comentarios_insert" on public.plan_tarea_comentarios
  for insert
  with check (public.plan_can_see_tarea(tarea_id) and created_by = auth.uid());
