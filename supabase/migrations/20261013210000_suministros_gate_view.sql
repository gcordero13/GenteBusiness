-- "Solicitud de suministros" was deliberately open to every authenticated
-- user, but the user wants the whole module gated behind can_view like
-- every other module (same change just made for Servicios Generales) -
-- nobody can browse the catalog or submit a request until explicitly
-- granted in Perfiles de rol. Approving a request is unaffected - that's
-- still derived from the org chart (approver_app_user_id), not a
-- permission flag.
drop policy "supply_articles_select_all" on public.supply_articles;

create policy "supply_articles_select" on public.supply_articles
  for select
  using (
    coalesce((select can_view from public.get_my_module_permissions('suministros')), false)
    or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
  );

drop policy "supply_requests_insert_own" on public.supply_requests;

create policy "supply_requests_insert_own" on public.supply_requests
  for insert
  with check (
    requester_app_user_id = auth.uid()
    and (
      coalesce((select can_view from public.get_my_module_permissions('suministros')), false)
      or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
    )
  );

drop policy "supply_request_exceptions_insert_own" on public.supply_request_exceptions;

create policy "supply_request_exceptions_insert_own" on public.supply_request_exceptions
  for insert
  with check (
    requester_app_user_id = auth.uid()
    and (
      coalesce((select can_view from public.get_my_module_permissions('suministros')), false)
      or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
    )
  );

-- Super Admin had can_view = false (can_manage/can_authorize were enough
-- when the catalog was open to everyone) - grant can_view too so it isn't
-- locked out now that viewing is gated.
update public.role_profile_permissions
set can_view = true
where module_id = (select id from public.modules where key = 'suministros')
  and role_profile_id = (select id from public.role_profiles where name = 'Super Admin');
