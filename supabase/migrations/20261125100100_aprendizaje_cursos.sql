-- Fase 1 of Aprendizaje: courses, ordered lessons, lesson files, and
-- per-user progress. Progress/enrollment rows are NEVER written by clients
-- directly (no insert/update policies) - only through
-- aprendizaje_marcar_leccion, so nobody can fake a completed course.

create or replace function public.aprendizaje_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select can_view or can_manage from public.get_my_module_permissions('aprendizaje')), false);
$$;

create or replace function public.aprendizaje_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select can_manage from public.get_my_module_permissions('aprendizaje')), false);
$$;

create or replace function public.aprendizaje_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.aprendizaje_cursos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  category text not null check (category in ('curso', 'historia')),
  status text not null default 'borrador' check (status in ('borrador', 'publicado', 'archivado')),
  cover_drive_id text,
  cover_item_id text,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cover_drive_id is null) = (cover_item_id is null))
);

create trigger aprendizaje_cursos_touch
before update on public.aprendizaje_cursos
for each row execute function public.aprendizaje_touch_updated_at();

create table public.aprendizaje_lecciones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  position int not null,
  title text not null check (length(trim(title)) > 0),
  body text,
  video_url text,
  video_drive_id text,
  video_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so aprendizaje_reordenar_lecciones can permute positions in
  -- one statement without tripping over transient duplicates.
  constraint aprendizaje_lecciones_position_unique unique (curso_id, position) deferrable initially deferred,
  check ((video_drive_id is null) = (video_item_id is null)),
  -- A lesson's video is either an external link or a SharePoint file, never both.
  check (video_url is null or video_drive_id is null)
);

create index aprendizaje_lecciones_curso_idx on public.aprendizaje_lecciones (curso_id);

create trigger aprendizaje_lecciones_touch
before update on public.aprendizaje_lecciones
for each row execute function public.aprendizaje_touch_updated_at();

create table public.aprendizaje_leccion_archivos (
  id uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.aprendizaje_lecciones (id) on delete cascade,
  filename text not null,
  content_type text not null,
  size_bytes bigint,
  drive_id text not null,
  item_id text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index aprendizaje_leccion_archivos_leccion_idx on public.aprendizaje_leccion_archivos (leccion_id);

create table public.aprendizaje_inscripciones (
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (curso_id, app_user_id)
);

create index aprendizaje_inscripciones_user_idx on public.aprendizaje_inscripciones (app_user_id);

create table public.aprendizaje_progreso_lecciones (
  leccion_id uuid not null references public.aprendizaje_lecciones (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (leccion_id, app_user_id)
);

create index aprendizaje_progreso_user_idx on public.aprendizaje_progreso_lecciones (app_user_id);

alter table public.aprendizaje_cursos enable row level security;
alter table public.aprendizaje_lecciones enable row level security;
alter table public.aprendizaje_leccion_archivos enable row level security;
alter table public.aprendizaje_inscripciones enable row level security;
alter table public.aprendizaje_progreso_lecciones enable row level security;

-- Cursos: managers see everything; learners only published courses.
create policy "aprendizaje_cursos_select" on public.aprendizaje_cursos
  for select using (public.aprendizaje_can_manage() or (status = 'publicado' and public.aprendizaje_can_view()));
create policy "aprendizaje_cursos_insert" on public.aprendizaje_cursos
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_cursos_update" on public.aprendizaje_cursos
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_cursos_delete" on public.aprendizaje_cursos
  for delete using (public.aprendizaje_can_manage());

-- Lecciones/archivos inherit visibility from their course (the subquery
-- runs under the caller's own RLS on aprendizaje_cursos).
create policy "aprendizaje_lecciones_select" on public.aprendizaje_lecciones
  for select using (exists (select 1 from public.aprendizaje_cursos c where c.id = curso_id));
create policy "aprendizaje_lecciones_insert" on public.aprendizaje_lecciones
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_lecciones_update" on public.aprendizaje_lecciones
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_lecciones_delete" on public.aprendizaje_lecciones
  for delete using (public.aprendizaje_can_manage());

create policy "aprendizaje_leccion_archivos_select" on public.aprendizaje_leccion_archivos
  for select using (exists (select 1 from public.aprendizaje_lecciones l where l.id = leccion_id));
create policy "aprendizaje_leccion_archivos_insert" on public.aprendizaje_leccion_archivos
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_leccion_archivos_update" on public.aprendizaje_leccion_archivos
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_leccion_archivos_delete" on public.aprendizaje_leccion_archivos
  for delete using (public.aprendizaje_can_manage());

-- Progress: read your own, managers read all. No write policies at all.
create policy "aprendizaje_inscripciones_select" on public.aprendizaje_inscripciones
  for select using (app_user_id = auth.uid() or public.aprendizaje_can_manage());
create policy "aprendizaje_progreso_select" on public.aprendizaje_progreso_lecciones
  for select using (app_user_id = auth.uid() or public.aprendizaje_can_manage());

-- Internal: sets completed_at once every lesson of the course is done.
-- Later phases extend this (evaluation passed, badges). Never revokes a
-- completion if lessons are added afterwards.
create or replace function public.aprendizaje_recalcular_completitud(p_curso_id uuid, p_app_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_done int;
begin
  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = p_app_user_id;

  if v_total > 0 and v_done >= v_total then
    update aprendizaje_inscripciones
    set completed_at = now()
    where curso_id = p_curso_id and app_user_id = p_app_user_id and completed_at is null;
  end if;
end;
$$;

revoke execute on function public.aprendizaje_recalcular_completitud(uuid, uuid) from public, anon, authenticated;

create or replace function public.aprendizaje_marcar_leccion(p_leccion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_curso_id uuid;
  v_status text;
begin
  if v_user is null or not public.aprendizaje_can_view() then
    raise exception 'No autorizado';
  end if;

  select l.curso_id, c.status into v_curso_id, v_status
  from aprendizaje_lecciones l
  join aprendizaje_cursos c on c.id = l.curso_id
  where l.id = p_leccion_id;

  if v_curso_id is null then
    raise exception 'Lección no encontrada';
  end if;
  if v_status <> 'publicado' then
    raise exception 'El curso no está publicado';
  end if;

  insert into aprendizaje_inscripciones (curso_id, app_user_id)
  values (v_curso_id, v_user)
  on conflict do nothing;

  insert into aprendizaje_progreso_lecciones (leccion_id, app_user_id)
  values (p_leccion_id, v_user)
  on conflict do nothing;

  perform public.aprendizaje_recalcular_completitud(v_curso_id, v_user);
end;
$$;

revoke execute on function public.aprendizaje_marcar_leccion(uuid) from public, anon;
grant execute on function public.aprendizaje_marcar_leccion(uuid) to authenticated;

-- Runs as the caller (security invoker), so the update policies above still
-- apply; the explicit check gives a clear error instead of a silent no-op.
create or replace function public.aprendizaje_reordenar_lecciones(p_curso_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.aprendizaje_can_manage() then
    raise exception 'No autorizado';
  end if;

  update aprendizaje_lecciones l
  set position = t.ord - 1
  from unnest(p_ids) with ordinality as t(id, ord)
  where l.id = t.id and l.curso_id = p_curso_id;
end;
$$;

revoke execute on function public.aprendizaje_reordenar_lecciones(uuid, uuid[]) from public, anon;
grant execute on function public.aprendizaje_reordenar_lecciones(uuid, uuid[]) to authenticated;
