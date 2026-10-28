-- Confirmed with the user: assigning a task to someone should let them see
-- (and work on) its whole subtree, not just that one row - today only an
-- explicit plan_tarea_compartidos share cascades through ancestor_ids;
-- being the ASSIGNEE of an ancestor task granted nothing for its
-- descendants. Extends plan_can_see_tarea/plan_can_edit_tarea with the
-- same cascading shape already used for shares, keyed on assignee_id
-- instead of a compartidos row.
create or replace function public.plan_can_see_tarea(p_tarea_id uuid)
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
        public.plan_can_see_proyecto(t.proyecto_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
        )
        or exists (
          select 1 from public.plan_tareas ancestor
          where ancestor.id = any (t.ancestor_ids)
            and ancestor.assignee_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.plan_can_edit_tarea(p_tarea_id uuid)
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
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
            and tc.access_level = 'editar'
        )
        or exists (
          select 1 from public.plan_tareas ancestor
          where ancestor.id = any (t.ancestor_ids)
            and ancestor.assignee_id = auth.uid()
        )
      )
  );
$$;
