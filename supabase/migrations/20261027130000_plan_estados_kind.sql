-- plan_estados gains `kind` (lets the app find "the Completado estado of
-- this project" regardless of what the user renames it to) and `is_default`
-- (marks the 4 seeded rows so they can never be deleted). Confirmed with
-- the user: En espera/En proceso/Completado/Cancelado must always exist on
-- every project; further custom estados stay fully editable/deletable.
alter table public.plan_estados
  add column kind text check (kind in ('en_espera', 'en_proceso', 'completado', 'cancelado')),
  add column is_default boolean not null default false;

create unique index plan_estados_kind_unique_per_proyecto
  on public.plan_estados (proyecto_id, kind)
  where kind is not null;

-- Backfill: the 2 projects that already exist only got the old 3-estado
-- default (no Cancelado). Match by current name to assign kind/is_default
-- to those 3, then insert the missing Cancelado for every project.
update public.plan_estados set kind = 'en_espera', is_default = true where name = 'En espera' and kind is null;
update public.plan_estados set kind = 'en_proceso', is_default = true where name = 'En proceso' and kind is null;
update public.plan_estados set kind = 'completado', is_default = true where name = 'Completado' and kind is null;

insert into public.plan_estados (proyecto_id, name, color, kind, is_default, sort_order)
select p.id, 'Cancelado', '#ef4444', 'cancelado', true,
  coalesce((select max(e.sort_order) + 1 from public.plan_estados e where e.proyecto_id = p.id), 0)
from public.plan_proyectos p
where not exists (
  select 1 from public.plan_estados e where e.proyecto_id = p.id and e.kind = 'cancelado'
);

-- Deletion of a default estado is blocked at the RLS layer, not just the
-- UI. plan_estados_write ("for all") can't express "insert/update allowed,
-- delete only when not default" in one policy (its USING clause would also
-- gate UPDATE), so it's split into three.
drop policy "plan_estados_write" on public.plan_estados;

create policy "plan_estados_insert" on public.plan_estados
  for insert
  with check (public.plan_can_edit_proyecto(proyecto_id));

create policy "plan_estados_update" on public.plan_estados
  for update
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));

create policy "plan_estados_delete" on public.plan_estados
  for delete
  using (public.plan_can_edit_proyecto(proyecto_id) and is_default = false);
