-- Lets a GoServices ejecutor see (and be notified about) a brand-new,
-- still-unassigned ticket that matches their configured type right away,
-- instead of waiting for a gestor to formally assign it first — confirmed
-- with the user ("que el mensajero vea los tickets que le llegaron de una
-- vez"). Scoped strictly to can_manage users (real ejecutores), and further
-- narrowed to their own goservices_ejecutor_type when set (null = "ambos",
-- sees every unassigned ticket regardless of type).
drop policy if exists "goservices_requests_select" on public.goservices_requests;
create policy "goservices_requests_select" on public.goservices_requests
  for select
  using (
    requester_app_user_id = auth.uid()
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
