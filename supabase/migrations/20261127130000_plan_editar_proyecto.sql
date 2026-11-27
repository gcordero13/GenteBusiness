-- Editing a project (user request, 2026-11-27). Name and description are
-- already editable by the owner and "Editar" shares (column grant from
-- 20261027090000). The department is not part of that grant on purpose: only
-- the project's creator may move it to another department, through this
-- function.
create or replace function public.plan_set_departamento_proyecto(p_proyecto_id uuid, p_departamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from plan_proyectos where id = p_proyecto_id and created_by = auth.uid()
  ) then
    raise exception 'Solo quien creó el proyecto puede cambiar su departamento';
  end if;
  update plan_proyectos set departamento_id = p_departamento_id where id = p_proyecto_id;
end;
$$;

revoke execute on function public.plan_set_departamento_proyecto(uuid, uuid) from public, anon;
grant execute on function public.plan_set_departamento_proyecto(uuid, uuid) to authenticated;
