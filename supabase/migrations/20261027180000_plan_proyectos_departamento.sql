-- New top-of-hierarchy layer confirmed with the user: Departamento ->
-- Proyecto -> Planificación -> Tarea -> Subtarea. Unlike Planificación,
-- this reuses the company's existing public.departments table (already
-- used by Contacts/Companies) instead of a new plan_* table - a project
-- belongs to at most one department, set only at creation time ("modo
-- avanzado"). departments.departments_select_any_authenticated already
-- lets any authenticated user read the full list, so no new RLS is needed
-- to pick one; plan_proyectos' own existing RLS is untouched - this is
-- just a new nullable FK, not a new access path into projects.
alter table public.plan_proyectos add column departamento_id uuid references public.departments(id) on delete set null;
