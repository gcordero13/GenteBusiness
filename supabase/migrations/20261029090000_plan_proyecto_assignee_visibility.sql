-- plan_can_see_proyecto never got the assignee fallback that
-- plan_can_see_tarea/plan_can_edit_tarea already received in
-- 20261028090000_plan_tarea_assignee_cascades.sql. An "responsable" who
-- was only ever given a task directly (assignee_id on plan_tareas, no
-- plan_proyecto_compartidos share) could not load the project page or
-- its plan_estados catalog, so they had no UI path to change that
-- task's estado - even though plan_tareas_update's own RLS
-- (plan_can_edit_tarea, which already checks assignee_id) would have
-- accepted the write. Every plan_proyectos/plan_proyecto_compartidos/
-- plan_estados select policy is built on this one function, so fixing
-- it here fixes all of them at once, consistent with this function's
-- own original intent (one place for the visibility rule).
create or replace function public.plan_can_see_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plan_proyectos p
    where p.id = p_proyecto_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1 from public.plan_proyecto_compartidos pc
          where pc.proyecto_id = p.id and pc.shared_with_app_user_id = auth.uid()
        )
        or exists (
          select 1 from public.plan_tareas t
          where t.proyecto_id = p.id and t.assignee_id = auth.uid()
        )
      )
  );
$$;
