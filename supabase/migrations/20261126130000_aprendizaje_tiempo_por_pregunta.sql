-- Seconds each person gets per question in a lesson quiz (user, 2026-11-26).
-- Set by the course author per quiz; null = no time limit. The quiz now
-- shows one question at a time; when the time runs out the question is left
-- unanswered (counts as incorrect) and the next one appears.
alter table public.aprendizaje_lecciones
  add column eval_seconds_per_question int check (eval_seconds_per_question between 5 and 600);
