-- Evaluations move from the course to each lesson (user, 2026-11-26): a
-- lesson can have its own quiz, worth a percentage of the course grade
-- (the quiz lessons' weights sum to 100), answered when the lesson ends.
-- Course grade = floor(sum(weight * best lesson score) / 100). The course
-- keeps the minimum passing grade and the attempts allowed per quiz.
--
-- Additive on purpose: the code deployed before this change still calls
-- aprendizaje_iniciar_intento(p_curso_id) and reads
-- aprendizaje_cursos.eval_questions_per_attempt, so both stay until a later
-- cleanup migration, once the new code is live.

alter table public.aprendizaje_lecciones
  add column eval_questions_per_attempt int check (eval_questions_per_attempt > 0),
  add column eval_weight int not null default 0 check (eval_weight between 0 and 100);

-- Nullable only for the transition window (old code inserts without it).
alter table public.aprendizaje_preguntas
  add column leccion_id uuid references public.aprendizaje_lecciones (id) on delete cascade;

create index aprendizaje_preguntas_leccion_idx on public.aprendizaje_preguntas (leccion_id);

-- Existing course-level questions move to their course's first lesson.
update public.aprendizaje_preguntas p
set leccion_id = (
  select l.id from public.aprendizaje_lecciones l
  where l.curso_id = p.curso_id
  order by l.position
  limit 1
)
where p.leccion_id is null;

alter table public.aprendizaje_intentos
  add column leccion_id uuid references public.aprendizaje_lecciones (id) on delete cascade;

-- One open attempt per person and QUIZ (was per course, which would block
-- having two lessons' quizzes open at once).
drop index public.aprendizaje_intentos_one_open_idx;
create unique index aprendizaje_intentos_open_por_leccion_idx
  on public.aprendizaje_intentos (leccion_id, app_user_id)
  where submitted_at is null and leccion_id is not null;

-- Course grade: weighted best score of each quiz lesson.
create or replace function public.aprendizaje_nota_curso(p_curso_id uuid, p_app_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(floor(sum(l.eval_weight * coalesce(best.score, 0)) / 100.0), 0)::int
  from aprendizaje_lecciones l
  left join (
    select leccion_id, max(score) as score
    from aprendizaje_intentos
    where app_user_id = p_app_user_id and submitted_at is not null and leccion_id is not null
    group by leccion_id
  ) best on best.leccion_id = l.id
  where l.curso_id = p_curso_id and l.eval_questions_per_attempt is not null;
$$;

revoke execute on function public.aprendizaje_nota_curso(uuid, uuid) from public, anon, authenticated;

-- Complete = every lesson done and, if the course has quizzes, a course
-- grade at or above the minimum.
create or replace function public.aprendizaje_recalcular_completitud(p_curso_id uuid, p_app_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_done int;
  v_has_quiz boolean;
  v_passing int;
begin
  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = p_app_user_id;
  select exists (
    select 1 from aprendizaje_lecciones where curso_id = p_curso_id and eval_questions_per_attempt is not null
  ) into v_has_quiz;
  select eval_passing_score into v_passing from aprendizaje_cursos where id = p_curso_id;

  if v_total > 0 and v_done >= v_total
     and (not v_has_quiz or public.aprendizaje_nota_curso(p_curso_id, p_app_user_id) >= v_passing) then
    update aprendizaje_inscripciones
    set completed_at = now()
    where curso_id = p_curso_id and app_user_id = p_app_user_id and completed_at is null;
  end if;
end;
$$;

revoke execute on function public.aprendizaje_recalcular_completitud(uuid, uuid) from public, anon, authenticated;

-- A lesson with a quiz is completed by answering it, not by "Marcar como vista".
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
  v_has_quiz boolean;
begin
  if v_user is null or not public.aprendizaje_can_view() then
    raise exception 'No autorizado';
  end if;

  select l.curso_id, c.status, l.eval_questions_per_attempt is not null
  into v_curso_id, v_status, v_has_quiz
  from aprendizaje_lecciones l
  join aprendizaje_cursos c on c.id = l.curso_id
  where l.id = p_leccion_id;

  if v_curso_id is null then
    raise exception 'Lección no encontrada';
  end if;
  if v_status <> 'publicado' then
    raise exception 'El curso no está publicado';
  end if;
  if v_has_quiz then
    raise exception 'Esta lección se completa respondiendo su cuestionario';
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

-- Starts (or resumes) a lesson's quiz: N random active questions of that
-- lesson, options shuffled except Verdadero/Falso.
create or replace function public.aprendizaje_iniciar_cuestionario(p_leccion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_curso_id uuid;
  v_status text;
  v_per_attempt int;
  v_max_attempts int;
  v_open uuid;
  v_used int;
  v_questions jsonb;
begin
  if v_user is null or not public.aprendizaje_can_view() then
    raise exception 'No autorizado';
  end if;

  select l.curso_id, c.status, l.eval_questions_per_attempt, c.eval_max_attempts
  into v_curso_id, v_status, v_per_attempt, v_max_attempts
  from aprendizaje_lecciones l
  join aprendizaje_cursos c on c.id = l.curso_id
  where l.id = p_leccion_id;

  if v_curso_id is null then
    raise exception 'Lección no encontrada';
  end if;
  if v_status <> 'publicado' then
    raise exception 'El curso no está publicado';
  end if;
  if v_per_attempt is null then
    raise exception 'Esta lección no tiene cuestionario';
  end if;

  select id into v_open
  from aprendizaje_intentos
  where leccion_id = p_leccion_id and app_user_id = v_user and submitted_at is null;
  if v_open is not null then
    return v_open;
  end if;

  if exists (
    select 1 from aprendizaje_inscripciones
    where curso_id = v_curso_id and app_user_id = v_user and completed_at is not null
  ) then
    raise exception 'Ya completaste este curso';
  end if;

  select count(*) into v_used from aprendizaje_intentos where leccion_id = p_leccion_id and app_user_id = v_user;
  if v_max_attempts is not null and v_used >= v_max_attempts then
    raise exception 'Ya usaste todos tus intentos de este cuestionario';
  end if;

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
    where leccion_id = p_leccion_id and active
  ) q
  where q.rn <= v_per_attempt;

  if jsonb_array_length(v_questions) = 0 then
    raise exception 'Este cuestionario todavía no tiene preguntas';
  end if;

  insert into aprendizaje_inscripciones (curso_id, app_user_id)
  values (v_curso_id, v_user)
  on conflict do nothing;

  insert into aprendizaje_intentos (curso_id, leccion_id, app_user_id, questions)
  values (v_curso_id, p_leccion_id, v_user, v_questions)
  returning id into v_open;

  return v_open;
end;
$$;

revoke execute on function public.aprendizaje_iniciar_cuestionario(uuid) from public, anon;
grant execute on function public.aprendizaje_iniciar_cuestionario(uuid) to authenticated;

-- Grades the attempt; a lesson quiz also marks its lesson as done. Returns
-- the lesson score plus the resulting course grade and completion.
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
  v_completed boolean;
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

  update aprendizaje_intentos
  set submitted_at = now(), answers = v_answers, score = v_score, passed = (v_total > 0 and v_score >= v_passing)
  where id = p_intento_id;

  if v_intento.leccion_id is not null then
    insert into aprendizaje_progreso_lecciones (leccion_id, app_user_id)
    values (v_intento.leccion_id, v_intento.app_user_id)
    on conflict do nothing;
  end if;

  perform public.aprendizaje_recalcular_completitud(v_intento.curso_id, v_intento.app_user_id);

  select completed_at is not null into v_completed
  from aprendizaje_inscripciones
  where curso_id = v_intento.curso_id and app_user_id = v_intento.app_user_id;

  return jsonb_build_object(
    'score', v_score,
    'passed', v_total > 0 and v_score >= v_passing,
    'correct', v_correct,
    'total', v_total,
    'nota_curso', public.aprendizaje_nota_curso(v_intento.curso_id, v_intento.app_user_id),
    'curso_completado', coalesce(v_completed, false)
  );
end;
$$;
