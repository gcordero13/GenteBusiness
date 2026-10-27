-- "Asignado" joins the protected default estados - confirmed with the
-- user: a task auto-moves here the instant someone is picked as its
-- assignee (the same kind-based lookup already used for completado), and
-- the person then moves it to En proceso/En espera/Completado/Cancelado
-- themselves as the work progresses. Desired column order across every
-- project, confirmed with the user: Asignado, En proceso, En espera,
-- Completado, Cancelado.
alter table public.plan_estados drop constraint plan_estados_kind_check;
alter table public.plan_estados
  add constraint plan_estados_kind_check
  check (kind in ('asignado', 'en_espera', 'en_proceso', 'completado', 'cancelado'));

-- Re-sort the 4 existing defaults into the new order.
update public.plan_estados set sort_order = 1 where kind = 'en_proceso';
update public.plan_estados set sort_order = 2 where kind = 'en_espera';
update public.plan_estados set sort_order = 3 where kind = 'completado';
update public.plan_estados set sort_order = 4 where kind = 'cancelado';

-- Backfill: insert the missing "Asignado" row (sort_order 0, ahead of
-- everything else) for every project that doesn't already have one.
insert into public.plan_estados (proyecto_id, name, color, kind, is_default, sort_order)
select p.id, 'Asignado', '#8b5cf6', 'asignado', true, 0
from public.plan_proyectos p
where not exists (
  select 1 from public.plan_estados e where e.proyecto_id = p.id and e.kind = 'asignado'
);
