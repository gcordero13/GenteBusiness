-- Tutorials are NOT courses (user, 2026-11-27): a tutorial is just a name,
-- the module it belongs to and one video (uploaded file or link) or one
-- image. Only people with permission on that module see it - in Aprende's
-- "Tutoriales" tab and in a pop-up when the platform opens, until they close
-- it once. Replaces the "tutorial" course category of 20261127110000.

-- 1. Courses go back to Cursos / Historias ---------------------------------
-- (the only 'tutorial' course in production was an empty draft; it stays,
-- as a course draft, for the user to delete if they want).
update public.aprendizaje_cursos set category = 'curso' where category = 'tutorial';
alter table public.aprendizaje_cursos drop constraint if exists aprendizaje_cursos_category_check;
alter table public.aprendizaje_cursos
  add constraint aprendizaje_cursos_category_check check (category in ('curso', 'historia'));

-- 2. Tutorials ----------------------------------------------------------------
create table public.aprendizaje_tutoriales (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  module_key text not null references public.modules (key) on update cascade on delete cascade,
  video_drive_id text,
  video_item_id text,
  video_url text,
  imagen_drive_id text,
  imagen_item_id text,
  active boolean not null default true,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint aprendizaje_tutoriales_video_ref_chk check ((video_drive_id is null) = (video_item_id is null)),
  constraint aprendizaje_tutoriales_imagen_ref_chk check ((imagen_drive_id is null) = (imagen_item_id is null)),
  -- Exactly one thing to show: an uploaded video, a video link or an image.
  constraint aprendizaje_tutoriales_un_medio_chk check (num_nonnulls(video_drive_id, video_url, imagen_drive_id) = 1)
);

create index aprendizaje_tutoriales_module_idx on public.aprendizaje_tutoriales (module_key);

alter table public.aprendizaje_tutoriales enable row level security;

-- Managers see and edit everything; everyone else only active tutorials of
-- modules their role profile has.
create policy "aprendizaje_tutoriales_select" on public.aprendizaje_tutoriales
  for select using (public.aprendizaje_can_manage() or (active and public.aprendizaje_tiene_modulo(module_key)));
create policy "aprendizaje_tutoriales_insert" on public.aprendizaje_tutoriales
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_tutoriales_update" on public.aprendizaje_tutoriales
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_tutoriales_delete" on public.aprendizaje_tutoriales
  for delete using (public.aprendizaje_can_manage());

-- Who already closed which tutorial pop-up (written only by the definer below).
create table public.aprendizaje_tutoriales_vistos (
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  tutorial_id uuid not null references public.aprendizaje_tutoriales (id) on delete cascade,
  closed_at timestamptz not null default now(),
  primary key (app_user_id, tutorial_id)
);

alter table public.aprendizaje_tutoriales_vistos enable row level security;

-- 3. Pop-up functions (replace the course-based ones) -------------------------
drop function if exists public.aprendizaje_tutoriales_pendientes();
drop function if exists public.aprendizaje_cerrar_tutorial(uuid);

create function public.aprendizaje_tutoriales_pendientes()
returns table (
  tutorial_id uuid,
  title text,
  module_key text,
  module_label text,
  video_url text,
  video_drive_id text,
  video_item_id text,
  imagen_drive_id text,
  imagen_item_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.title, m.key, m.label, t.video_url, t.video_drive_id, t.video_item_id, t.imagen_drive_id, t.imagen_item_id
  from aprendizaje_tutoriales t
  join modules m on m.key = t.module_key
  where t.active
    and public.aprendizaje_tiene_modulo(t.module_key)
    and not exists (
      select 1 from aprendizaje_tutoriales_vistos v
      where v.tutorial_id = t.id and v.app_user_id = auth.uid()
    )
  order by t.created_at desc;
$$;

revoke execute on function public.aprendizaje_tutoriales_pendientes() from public, anon;
grant execute on function public.aprendizaje_tutoriales_pendientes() to authenticated;

create function public.aprendizaje_cerrar_tutorial(p_tutorial_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  insert into aprendizaje_tutoriales_vistos (app_user_id, tutorial_id)
  values (auth.uid(), p_tutorial_id)
  on conflict do nothing;
end;
$$;

revoke execute on function public.aprendizaje_cerrar_tutorial(uuid) from public, anon;
grant execute on function public.aprendizaje_cerrar_tutorial(uuid) to authenticated;

-- The file route serves a tutorial's video or image to the people who may see
-- it (and to managers, for the preview in Gestión).
create or replace function public.aprendizaje_tutorial_video_visible(p_drive_id text, p_item_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from aprendizaje_tutoriales t
    where (
        (t.video_drive_id = p_drive_id and t.video_item_id = p_item_id)
        or (t.imagen_drive_id = p_drive_id and t.imagen_item_id = p_item_id)
      )
      and (public.aprendizaje_can_manage() or (t.active and public.aprendizaje_tiene_modulo(t.module_key)))
  );
$$;

-- No longer used: general tutorials are gone (every tutorial has a module).
drop function if exists public.aprendizaje_tutorial_para_mi(text);
