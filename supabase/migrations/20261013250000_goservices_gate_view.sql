-- The plain "GoServices" page ("Mis solicitudes" + crear una solicitud)
-- was open to every authenticated user; the user wants it gated behind
-- explicit role-profile permissions - can_view ("ver") and can_add
-- ("agregar") - same policy already applied to Suministros and Servicios
-- Generales. Ejecutor visibility (assigned_app_user_id) and gestor
-- oversight (can_authorize/can_manage) are untouched - those already have
-- their own gates (the "Asignadas" and "Gestión" pages).
drop policy "goservices_requests_select" on public.goservices_requests;

create policy "goservices_requests_select" on public.goservices_requests
  for select
  using (
    (
      requester_app_user_id = auth.uid()
      and (
        coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
        or coalesce((select can_add from public.get_my_module_permissions('goservices')), false)
      )
    )
    or assigned_app_user_id = auth.uid()
    or coalesce((select can_authorize from public.get_my_module_permissions('goservices')), false)
    or (
      assigned_app_user_id is null
      and coalesce((select can_manage from public.get_my_module_permissions('goservices')), false)
      and (
        (select goservices_ejecutor_type from public.app_users where id = auth.uid()) is null
        or (select goservices_ejecutor_type from public.app_users where id = auth.uid()) = request_type
      )
    )
  );

drop policy "goservices_requests_insert" on public.goservices_requests;

create policy "goservices_requests_insert" on public.goservices_requests
  for insert
  with check (
    requester_app_user_id = auth.uid()
    and (
      coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
      or coalesce((select can_add from public.get_my_module_permissions('goservices')), false)
    )
  );
