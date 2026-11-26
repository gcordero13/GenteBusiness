-- Course grade divided by the actual total of the quiz weights instead of a
-- fixed 100 (user report, 2026-11-26: a published course whose weights were
-- later changed to 100 + 50 showed a 150% grade). With weights adding up to
-- 100 (required to publish) the result is exactly the same as before.
-- Mirrors notaCurso() in src/lib/aprendizaje/evaluacion.ts.
create or replace function public.aprendizaje_nota_curso(p_curso_id uuid, p_app_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(floor(sum(l.eval_weight * coalesce(best.score, 0)) / nullif(sum(l.eval_weight), 0)), 0)::int
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
