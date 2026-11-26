-- Fase 3 of Aprendizaje: evaluations drawn from a per-course question bank.
-- Learners never read questions/options directly (they would see
-- is_correct): the drawn questions come from aprendizaje_preguntas_intento,
-- which strips the answers, and grading happens server-side in
-- aprendizaje_enviar_intento.

-- eval_questions_per_attempt null = the course has no evaluation.
alter table public.aprendizaje_cursos
  add column eval_questions_per_attempt int check (eval_questions_per_attempt > 0),
  add column eval_passing_score int not null default 70 check (eval_passing_score between 1 and 100),
  add column eval_max_attempts int check (eval_max_attempts > 0);

create table public.aprendizaje_preguntas (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  type text not null check (type in ('opcion_unica', 'verdadero_falso')),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index aprendizaje_preguntas_curso_idx on public.aprendizaje_preguntas (curso_id);

create table public.aprendizaje_opciones (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references public.aprendizaje_preguntas (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  is_correct boolean not null default false,
  position int not null default 0
);

create index aprendizaje_opciones_pregunta_idx on public.aprendizaje_opciones (pregunta_id);

create table public.aprendizaje_intentos (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- [{ "pregunta_id": uuid, "option_ids": [uuid, ...] }] in the order shown.
  questions jsonb not null,
  -- { "<pregunta_id>": "<option_id>" }
  answers jsonb,
  score int,
  passed boolean
);

create index aprendizaje_intentos_curso_user_idx on public.aprendizaje_intentos (curso_id, app_user_id);
-- At most one open (unsubmitted) attempt per person and course.
create unique index aprendizaje_intentos_one_open_idx
  on public.aprendizaje_intentos (curso_id, app_user_id) where submitted_at is null;

alter table public.aprendizaje_preguntas enable row level security;
alter table public.aprendizaje_opciones enable row level security;
alter table public.aprendizaje_intentos enable row level security;

create policy "aprendizaje_preguntas_manage" on public.aprendizaje_preguntas
  for all using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_opciones_manage" on public.aprendizaje_opciones
  for all using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());

create policy "aprendizaje_intentos_select" on public.aprendizaje_intentos
  for select using (app_user_id = auth.uid() or public.aprendizaje_can_manage());
-- Managers may delete attempts (to give someone extra tries); nobody writes them directly.
create policy "aprendizaje_intentos_delete" on public.aprendizaje_intentos
  for delete using (public.aprendizaje_can_manage());

-- A course with an evaluation is complete only once an attempt has passed.
create or replace function public.aprendizaje_recalcular_completitud(p_curso_id uuid, p_app_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_done int;
  v_has_eval boolean;
  v_passed boolean;
begin
  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = p_app_user_id;
  select eval_questions_per_attempt is not null into v_has_eval from aprendizaje_cursos where id = p_curso_id;
  select exists (
    select 1 from aprendizaje_intentos
    where curso_id = p_curso_id and app_user_id = p_app_user_id and passed
  ) into v_passed;

  if v_total > 0 and v_done >= v_total and (not coalesce(v_has_eval, false) or v_passed) then
    update aprendizaje_inscripciones
    set completed_at = now()
    where curso_id = p_curso_id and app_user_id = p_app_user_id and completed_at is null;
  end if;
end;
$$;

revoke execute on function public.aprendizaje_recalcular_completitud(uuid, uuid) from public, anon, authenticated;

-- Returns the open attempt if there is one (same draw, never re-drawn);
-- otherwise validates and draws a new one.
create or replace function public.aprendizaje_iniciar_intento(p_curso_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_curso aprendizaje_cursos%rowtype;
  v_open uuid;
  v_total int;
  v_done int;
  v_used int;
  v_questions jsonb;
begin
  if v_user is null or not public.aprendizaje_can_view() then
    raise exception 'No autorizado';
  end if;

  select * into v_curso from aprendizaje_cursos where id = p_curso_id;
  if not found or v_curso.status <> 'publicado' then
    raise exception 'El curso no está publicado';
  end if;
  if v_curso.eval_questions_per_attempt is null then
    raise exception 'Este curso no tiene evaluación';
  end if;

  select id into v_open
  from aprendizaje_intentos
  where curso_id = p_curso_id and app_user_id = v_user and submitted_at is null;
  if v_open is not null then
    return v_open;
  end if;

  if exists (select 1 from aprendizaje_intentos where curso_id = p_curso_id and app_user_id = v_user and passed) then
    raise exception 'Ya aprobaste esta evaluación';
  end if;

  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = v_user;
  if v_done < v_total then
    raise exception 'Primero completa todas las lecciones';
  end if;

  select count(*) into v_used from aprendizaje_intentos where curso_id = p_curso_id and app_user_id = v_user;
  if v_curso.eval_max_attempts is not null and v_used >= v_curso.eval_max_attempts then
    raise exception 'Ya usaste todos tus intentos';
  end if;

  -- Random questions in random order; options shuffled too, except
  -- Verdadero/Falso, which keep their natural order.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'pregunta_id', q.id,
             'option_ids', (
               select coalesce(jsonb_agg(o.id order by
                        case when q.type = 'verdadero_falso' then o.position::float8 else random() end), '[]'::jsonb)
               from aprendizaje_opciones o
               where o.pregunta_id = q.id
             )
           ) order by q.rn), '[]'::jsonb)
  into v_questions
  from (
    select id, type, row_number() over (order by random()) as rn
    from aprendizaje_preguntas
    where curso_id = p_curso_id and active
  ) q
  where q.rn <= v_curso.eval_questions_per_attempt;

  if jsonb_array_length(v_questions) = 0 then
    raise exception 'La evaluación todavía no tiene preguntas';
  end if;

  insert into aprendizaje_inscripciones (curso_id, app_user_id)
  values (p_curso_id, v_user)
  on conflict do nothing;

  insert into aprendizaje_intentos (curso_id, app_user_id, questions)
  values (p_curso_id, v_user, v_questions)
  returning id into v_open;

  return v_open;
end;
$$;

revoke execute on function public.aprendizaje_iniciar_intento(uuid) from public, anon;
grant execute on function public.aprendizaje_iniciar_intento(uuid) to authenticated;

-- The attempt's questions for its owner, WITHOUT is_correct.
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

-- Grades the attempt (score = floor(correct / total * 100)), records it and
-- recalculates completion. Questions deleted after the draw don't count.
create or replace function public.aprendizaje_enviar_intento(p_intento_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intento aprendizaje_intentos%rowtype;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_passing int;
  v_total int;
  v_correct int;
  v_score int;
  v_passed boolean;
begin
  select * into v_intento
  from aprendizaje_intentos
  where id = p_intento_id and app_user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Intento no encontrado';
  end if;
  if v_intento.submitted_at is not null then
    raise exception 'Este intento ya fue enviado';
  end if;

  select eval_passing_score into v_passing from aprendizaje_cursos where id = v_intento.curso_id;

  select count(*), count(*) filter (where o.is_correct)
  into v_total, v_correct
  from jsonb_array_elements(v_intento.questions) as q(value)
  join aprendizaje_preguntas p on p.id::text = q.value ->> 'pregunta_id'
  left join aprendizaje_opciones o
    on o.pregunta_id = p.id and o.id::text = v_answers ->> p.id::text;

  v_score := case when v_total = 0 then 0 else floor(v_correct * 100.0 / v_total)::int end;
  v_passed := v_total > 0 and v_score >= v_passing;

  update aprendizaje_intentos
  set submitted_at = now(), answers = v_answers, score = v_score, passed = v_passed
  where id = p_intento_id;

  perform public.aprendizaje_recalcular_completitud(v_intento.curso_id, v_intento.app_user_id);

  return jsonb_build_object('score', v_score, 'passed', v_passed, 'correct', v_correct, 'total', v_total);
end;
$$;

revoke execute on function public.aprendizaje_enviar_intento(uuid, jsonb) from public, anon;
grant execute on function public.aprendizaje_enviar_intento(uuid, jsonb) to authenticated;
