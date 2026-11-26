-- Bug fix (2026-11-26): a person who completed a course BEFORE one of its
-- lessons got a quiz could never answer that quiz - aprendizaje_iniciar_cuestionario
-- rejected them with "Ya completaste este curso", and the page showed no
-- button. A completed course no longer blocks a quiz: the person can answer
-- (or retake, while attempts remain) and their grade can only go up.
-- Identical to 20261126110000's version minus that check.
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
