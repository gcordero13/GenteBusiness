-- Aprende: three fixed categories and tutorial pop-ups (user request, 2026-11-27).
--
-- 1. Categories: Cursos ('curso'), Tutoriales ('tutorial'), Historias
--    ('historia'). Courses already tagged as a module's tutorial move to
--    'tutorial'.
-- 2. A published tutorial with a video or an image pops up when the platform
--    opens, until the person closes it once:
--    - if it explains a module (tutorial_module_key), only for people whose
--      role profile has that module;
--    - otherwise, for everyone with access to Aprende.
--    It shows the first video; without one, the first image of its lessons,
--    else its cover. anunciar_al_iniciar stays as the per-tutorial switch.

alter table public.aprendizaje_cursos drop constraint if exists aprendizaje_cursos_category_check;
alter table public.aprendizaje_cursos
  add constraint aprendizaje_cursos_category_check check (category in ('curso', 'tutorial', 'historia'));

update public.aprendizaje_cursos
set category = 'tutorial'
where tutorial_module_key is not null and category = 'curso';

-- Who may see a tutorial's pop-up (and its files).
create or replace function public.aprendizaje_tutorial_para_mi(p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_module_key is not null then public.aprendizaje_tiene_modulo(p_module_key)
    else public.aprendizaje_can_view()
  end;
$$;

revoke execute on function public.aprendizaje_tutorial_para_mi(text) from public, anon;
grant execute on function public.aprendizaje_tutorial_para_mi(text) to authenticated;

-- New columns (image fallback), so the old signature must be dropped first.
drop function if exists public.aprendizaje_tutoriales_pendientes();

create function public.aprendizaje_tutoriales_pendientes()
returns table (
  curso_id uuid,
  title text,
  description text,
  module_key text,
  module_label text,
  leccion_title text,
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
  select c.id,
         c.title,
         c.description,
         m.key,
         m.label,
         coalesce(v.title, c.title),
         v.video_url,
         v.video_drive_id,
         v.video_item_id,
         case when v.title is null then coalesce(img.drive_id, c.cover_drive_id) end,
         case when v.title is null then coalesce(img.item_id, c.cover_item_id) end
  from aprendizaje_cursos c
  left join modules m on m.key = c.tutorial_module_key
  left join lateral (
    select l.title, l.video_url, l.video_drive_id, l.video_item_id
    from aprendizaje_lecciones l
    where l.curso_id = c.id and (l.video_url is not null or l.video_drive_id is not null)
    order by l.position
    limit 1
  ) v on true
  left join lateral (
    select a.drive_id, a.item_id
    from aprendizaje_leccion_archivos a
    join aprendizaje_lecciones l on l.id = a.leccion_id
    where l.curso_id = c.id and a.content_type like 'image/%'
    order by l.position, a.position
    limit 1
  ) img on true
  where c.status = 'publicado'
    and c.category = 'tutorial'
    and c.anunciar_al_iniciar
    and (v.title is not null or img.drive_id is not null or c.cover_drive_id is not null)
    and public.aprendizaje_tutorial_para_mi(c.tutorial_module_key)
    and not exists (
      select 1 from aprendizaje_tutoriales_cerrados t
      where t.curso_id = c.id and t.app_user_id = auth.uid()
    )
  order by c.updated_at desc;
$$;

revoke execute on function public.aprendizaje_tutoriales_pendientes() from public, anon;
grant execute on function public.aprendizaje_tutoriales_pendientes() to authenticated;

-- The file route also serves a pending tutorial's video, lesson image or
-- cover to the people it pops up for (they may lack Aprende access).
create or replace function public.aprendizaje_tutorial_video_visible(p_drive_id text, p_item_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from aprendizaje_cursos c
    where c.status = 'publicado'
      and c.category = 'tutorial'
      and c.anunciar_al_iniciar
      and public.aprendizaje_tutorial_para_mi(c.tutorial_module_key)
      and (
        (c.cover_drive_id = p_drive_id and c.cover_item_id = p_item_id)
        or exists (
          select 1 from aprendizaje_lecciones l
          where l.curso_id = c.id and l.video_drive_id = p_drive_id and l.video_item_id = p_item_id
        )
        or exists (
          select 1
          from aprendizaje_leccion_archivos a
          join aprendizaje_lecciones l on l.id = a.leccion_id
          where l.curso_id = c.id and a.drive_id = p_drive_id and a.item_id = p_item_id
            and a.content_type like 'image/%'
        )
      )
  );
$$;
