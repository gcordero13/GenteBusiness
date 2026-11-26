-- Two changes requested by the user on 2026-11-26.
--
-- 1. The time limit is set per QUESTION (not per quiz): each bank question
--    has its own seconds (null = no limit). The quiz-level column from
--    20261126130000 was never used by deployed code, so it is dropped.
--
-- 2. Module tutorials: a published course can be tagged as the tutorial of a
--    platform module (Vacaciones, Planificación...) and announced at login.
--    It pops up ("Nuevo módulo") for people whose role profile has that
--    module, until they close it once. They can watch its video even without
--    Aprendizaje access, so the file route asks
--    aprendizaje_tutorial_video_visible() as well as the RLS lookups.

-- 1. Per-question time ------------------------------------------------------

alter table public.aprendizaje_preguntas
  add column if not exists seconds int check (seconds between 5 and 600);

alter table public.aprendizaje_lecciones
  drop column if exists eval_seconds_per_question;

-- Same as before plus 'seconds'; still never exposes is_correct.
create or replace function public.aprendizaje_preguntas_intento(p_intento_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_questions jsonb;
begin
  select questions into v_questions
  from aprendizaje_intentos
  where id = p_intento_id and app_user_id = auth.uid();
  if v_questions is null then
    raise exception 'Intento no encontrado';
  end if;

  return (
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'text', p.text,
               'type', p.type,
               'seconds', p.seconds,
               'options', (
                 select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by oo.ord), '[]'::jsonb)
                 from jsonb_array_elements_text(q.value -> 'option_ids') with ordinality as oo(option_id, ord)
                 join aprendizaje_opciones o on o.id::text = oo.option_id
               )
             ) order by q.ord), '[]'::jsonb)
    from jsonb_array_elements(v_questions) with ordinality as q(value, ord)
    join aprendizaje_preguntas p on p.id::text = q.value ->> 'pregunta_id'
  );
end;
$$;

revoke execute on function public.aprendizaje_preguntas_intento(uuid) from public, anon;
grant execute on function public.aprendizaje_preguntas_intento(uuid) to authenticated;

-- 2. Module tutorials --------------------------------------------------------

alter table public.aprendizaje_cursos
  add column tutorial_module_key text references public.modules (key) on update cascade on delete set null,
  add column anunciar_al_iniciar boolean not null default false;

-- Who already closed which tutorial pop-up. Only touched through the
-- definer functions below, so RLS is on with no policies.
create table public.aprendizaje_tutoriales_cerrados (
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  closed_at timestamptz not null default now(),
  primary key (app_user_id, curso_id)
);

alter table public.aprendizaje_tutoriales_cerrados enable row level security;

-- True when the caller's role profile has ANY permission on the module.
create or replace function public.aprendizaje_tiene_modulo(p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_users au
    join role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
    join modules m on m.id = rpp.module_id
    where au.id = auth.uid()
      and m.key = p_module_key
      and (rpp.can_view or rpp.can_add or rpp.can_edit or rpp.can_delete
           or rpp.can_deactivate or rpp.can_manage or rpp.can_authorize)
  );
$$;

revoke execute on function public.aprendizaje_tiene_modulo(text) from public, anon;
grant execute on function public.aprendizaje_tiene_modulo(text) to authenticated;

-- The caller's pending tutorial pop-ups, newest first, each with the first
-- lesson that has a video.
create or replace function public.aprendizaje_tutoriales_pendientes()
returns table (
  curso_id uuid,
  title text,
  description text,
  module_key text,
  module_label text,
  leccion_title text,
  video_url text,
  video_drive_id text,
  video_item_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.description, m.key, m.label, v.title, v.video_url, v.video_drive_id, v.video_item_id
  from aprendizaje_cursos c
  join modules m on m.key = c.tutorial_module_key
  join lateral (
    select l.title, l.video_url, l.video_drive_id, l.video_item_id
    from aprendizaje_lecciones l
    where l.curso_id = c.id and (l.video_url is not null or l.video_drive_id is not null)
    order by l.position
    limit 1
  ) v on true
  where c.status = 'publicado'
    and c.anunciar_al_iniciar
    and public.aprendizaje_tiene_modulo(c.tutorial_module_key)
    and not exists (
      select 1 from aprendizaje_tutoriales_cerrados t
      where t.curso_id = c.id and t.app_user_id = auth.uid()
    )
  order by c.updated_at desc;
$$;

revoke execute on function public.aprendizaje_tutoriales_pendientes() from public, anon;
grant execute on function public.aprendizaje_tutoriales_pendientes() to authenticated;

create or replace function public.aprendizaje_cerrar_tutorial(p_curso_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  insert into aprendizaje_tutoriales_cerrados (app_user_id, curso_id)
  values (auth.uid(), p_curso_id)
  on conflict do nothing;
end;
$$;

revoke execute on function public.aprendizaje_cerrar_tutorial(uuid) from public, anon;
grant execute on function public.aprendizaje_cerrar_tutorial(uuid) to authenticated;

-- Lets the file route serve a tutorial's video to people with the module.
create or replace function public.aprendizaje_tutorial_video_visible(p_drive_id text, p_item_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from aprendizaje_lecciones l
    join aprendizaje_cursos c on c.id = l.curso_id
    where l.video_drive_id = p_drive_id
      and l.video_item_id = p_item_id
      and c.status = 'publicado'
      and c.anunciar_al_iniciar
      and c.tutorial_module_key is not null
      and public.aprendizaje_tiene_modulo(c.tutorial_module_key)
  );
$$;

revoke execute on function public.aprendizaje_tutorial_video_visible(text, text) from public, anon;
grant execute on function public.aprendizaje_tutorial_video_visible(text, text) to authenticated;
