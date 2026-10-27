-- Security hardening for the Proyectos system (plan_* tables), closing
-- four privilege-escalation gaps found in the final code review of
-- 20261026100000..20261026100300. Finding codes (C2, C3, I1, I2) refer to
-- that review and are repeated above each fix as a paper trail. Purely
-- additive/replacing: no table shape changes, no data rewritten.

-- ---------------------------------------------------------------------
-- C2 - plan_proyectos UPDATE could transfer ownership.
-- plan_proyectos_update's WITH CHECK only re-checks plan_can_edit_proyecto
-- by id; it never restricted WHICH columns change. Any editar-level share
-- holder could `set created_by = <self>`, becoming the owner and locking
-- out the real owner (who has no share row of their own). RLS can't
-- compare OLD vs NEW, so the fix is a column-level privilege: the
-- authenticated role may only update the columns the app actually edits.
-- created_by/id/created_at are no longer writable through the API at all
-- (service_role is unaffected).
-- ---------------------------------------------------------------------
revoke update on public.plan_proyectos from authenticated;
grant update (name, description, archived) on public.plan_proyectos to authenticated;

-- ---------------------------------------------------------------------
-- C3 - plan_tareas UPDATE could rewrite ownership, project and hierarchy.
-- Same shape as C2: plan_tareas_update's WITH CHECK only re-checks
-- plan_can_edit_tarea(id). Anyone with edit rights (owner, assignee, or an
-- editar share via the ancestor cascade) could set created_by = self
-- (ownership surviving share revocation), move the task into another
-- proyecto_id they control, or rewrite parent_task_id/ancestor_ids
-- (cycles, stale sharing - ancestor_ids is only ever meant to be written
-- by the plan_set_tarea_ancestor_ids trigger). The grant below is exactly
-- the set of columns written by updateTarea/updateTareaEstado/
-- updateTareaFecha in planificacion/proyectos/actions.ts, plus sort_order
-- (manual ordering). proyecto_id, parent_task_id, ancestor_ids,
-- created_by, id and created_at are not updatable by authenticated.
-- ---------------------------------------------------------------------
revoke update on public.plan_tareas from authenticated;
grant update (
  title,
  description,
  estado_id,
  priority,
  labels,
  start_date,
  due_date,
  assignee_id,
  ciclo_id,
  sort_order
) on public.plan_tareas to authenticated;

-- ---------------------------------------------------------------------
-- I1 - cross-project references in plan_tareas.
-- plan_tareas_insert only checks plan_can_edit_tarea(parent_task_id); it
-- never confirmed the parent lives in the same proyecto_id as the new row,
-- so a user could hang children of their own task under a proyecto_id
-- they don't own, corrupting another project's tree. estado_id and
-- ciclo_id (nullable FKs) were never checked against the task's own
-- proyecto_id either. A CHECK constraint can't reference other tables, so
-- the existing BEFORE INSERT trigger function is replaced with the same
-- body plus these three validations. The ancestor_ids computation (root ->
-- '{}', child -> parent.ancestor_ids || parent.id) is unchanged.
--
-- Now SECURITY DEFINER (search_path pinned like the plan_can_* functions):
-- the consistency checks must see the real plan_estados/plan_ciclos rows
-- regardless of the caller's own RLS visibility - e.g. a task-only
-- sharee who can't see the project's estados must still get a correct
-- answer, not a spurious "doesn't exist". This does not widen who may
-- insert: plan_tareas_insert's WITH CHECK still runs after this trigger
-- and still requires edit rights on the project/parent. The only visible
-- difference is the error message an unauthorized caller gets, and the FK
-- on parent_task_id already reveals row existence the same way.
-- ---------------------------------------------------------------------
create or replace function public.plan_set_tarea_ancestor_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_row public.plan_tareas%rowtype;
begin
  if new.parent_task_id is null then
    new.ancestor_ids := '{}';
  else
    select * into parent_row from public.plan_tareas where id = new.parent_task_id;
    if not found then
      raise exception 'parent_task_id % no existe', new.parent_task_id;
    end if;
    -- I1: the parent must belong to the same project as the new child.
    if parent_row.proyecto_id <> new.proyecto_id then
      raise exception 'parent_task_id % pertenece a otro proyecto', new.parent_task_id;
    end if;
    new.ancestor_ids := parent_row.ancestor_ids || parent_row.id;
  end if;

  -- I1: estado_id/ciclo_id, when set, must belong to the task's project.
  if new.estado_id is not null and not exists (
    select 1 from public.plan_estados e
    where e.id = new.estado_id and e.proyecto_id = new.proyecto_id
  ) then
    raise exception 'estado_id % no pertenece al proyecto %', new.estado_id, new.proyecto_id;
  end if;

  if new.ciclo_id is not null and not exists (
    select 1 from public.plan_ciclos c
    where c.id = new.ciclo_id and c.proyecto_id = new.proyecto_id
  ) then
    raise exception 'ciclo_id % no pertenece al proyecto %', new.ciclo_id, new.proyecto_id;
  end if;

  return new;
end;
$$;

-- I1 (update path): estado_id and ciclo_id remain updatable under C3's
-- grant, and plan_set_tarea_ancestor_ids only fires on INSERT - without
-- this, the same cross-project reference could simply be written with an
-- UPDATE afterwards (e.g. via the Kanban drag in updateTareaEstado). Only
-- validates values that actually changed: updateTarea always re-sends the
-- current estado_id/ciclo_id, and an unchanged (already valid) value must
-- never block an unrelated edit. proyecto_id is included for service_role
-- writes; authenticated can't change it anyway (C3).
create or replace function public.plan_validate_tarea_refs_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado_id is not null
     and (new.estado_id is distinct from old.estado_id or new.proyecto_id is distinct from old.proyecto_id)
     and not exists (
       select 1 from public.plan_estados e
       where e.id = new.estado_id and e.proyecto_id = new.proyecto_id
     ) then
    raise exception 'estado_id % no pertenece al proyecto %', new.estado_id, new.proyecto_id;
  end if;

  if new.ciclo_id is not null
     and (new.ciclo_id is distinct from old.ciclo_id or new.proyecto_id is distinct from old.proyecto_id)
     and not exists (
       select 1 from public.plan_ciclos c
       where c.id = new.ciclo_id and c.proyecto_id = new.proyecto_id
     ) then
    raise exception 'ciclo_id % no pertenece al proyecto %', new.ciclo_id, new.proyecto_id;
  end if;

  return new;
end;
$$;

create trigger plan_tareas_validate_refs_on_update
  before update of estado_id, ciclo_id, proyecto_id on public.plan_tareas
  for each row
  execute function public.plan_validate_tarea_refs_on_update();

-- I1 (plan_tarea_modulos): linking a task to a module from a different
-- project was equally unchecked (plan_tarea_modulos_write only requires
-- edit rights on the task). Separate trigger because it's a different
-- table/insert path. Also fires on UPDATE so the link can't be re-pointed
-- afterwards (the app never updates this table - it deletes and
-- re-inserts - so this costs nothing). SECURITY DEFINER for the same
-- reason as above: a task-only editor may not be able to see plan_modulos
-- through RLS, and updateTarea re-inserts the task's existing links.
create or replace function public.plan_check_tarea_modulo_same_proyecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.plan_tareas t
    join public.plan_modulos m on m.proyecto_id = t.proyecto_id
    where t.id = new.tarea_id and m.id = new.modulo_id
  ) then
    raise exception 'modulo_id % no pertenece al proyecto de la tarea %', new.modulo_id, new.tarea_id;
  end if;
  return new;
end;
$$;

create trigger plan_tarea_modulos_check_same_proyecto
  before insert or update on public.plan_tarea_modulos
  for each row
  execute function public.plan_check_tarea_modulo_same_proyecto();

-- ---------------------------------------------------------------------
-- I2 - laundering task ownership/assignment into subtree-wide editar, and
-- forgeable shared_by.
-- plan_tarea_compartidos_write gated on plan_can_edit_tarea, which is also
-- true for the task's creator/assignee. So an assignee who only had ver on
-- the project could share editar on their own task to themselves or anyone
-- - and since task shares cascade through ancestor_ids, that granted
-- editar over every descendant, including tasks other people created.
-- plan_can_delegate_tarea is plan_can_edit_tarea minus the
-- created_by/assignee_id fallback: delegating requires a real editar grant
-- covering the whole subtree (editar on the project, or an editar share on
-- this task or an ancestor). Owning/being assigned a task still lets you
-- edit it (plan_can_edit_tarea is untouched); it just no longer lets you
-- hand out access to it.
--
-- plan_proyecto_compartidos_write keeps plan_can_edit_proyecto: that
-- function has no assignee-style fallback (only the true root owner or a
-- real editar share), so it has no equivalent escalation path.
--
-- Both write policies' WITH CHECK now also require shared_by = auth.uid()
-- (no misattributing who granted a share) and shared_with_app_user_id <>
-- auth.uid() (no granting/upgrading a share to yourself). The app's
-- shareProyecto/shareTarea upserts already send shared_by = user.id.
-- USING (which gates DELETE/revoke and which existing rows an upsert may
-- touch) keeps only the edit/delegate-rights check.
-- ---------------------------------------------------------------------
create or replace function public.plan_can_delegate_tarea(p_tarea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.plan_tareas t
    where t.id = p_tarea_id
      and (
        public.plan_can_edit_proyecto(t.proyecto_id)
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
            and tc.access_level = 'editar'
        )
      )
  );
$$;

drop policy "plan_tarea_compartidos_write" on public.plan_tarea_compartidos;
create policy "plan_tarea_compartidos_write" on public.plan_tarea_compartidos
  for all
  using (public.plan_can_delegate_tarea(tarea_id))
  with check (
    public.plan_can_delegate_tarea(tarea_id)
    and shared_by = auth.uid()
    and shared_with_app_user_id <> auth.uid()
  );

drop policy "plan_proyecto_compartidos_write" on public.plan_proyecto_compartidos;
create policy "plan_proyecto_compartidos_write" on public.plan_proyecto_compartidos
  for all
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (
    public.plan_can_edit_proyecto(proyecto_id)
    and shared_by = auth.uid()
    and shared_with_app_user_id <> auth.uid()
  );
