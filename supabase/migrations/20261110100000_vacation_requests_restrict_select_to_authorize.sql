-- Visibility rule (explicit requirement): a vacation/permission request is
-- only ever visible to the requester, their resolved direct supervisor, and
-- whoever holds "Gestionar" (can_authorize) on solicitudes_vacaciones — e.g.
-- Gestion Humana. can_view alone (even for Super Admin) must NOT grant
-- oversight of everyone else's requests for this module.
alter policy "vacation_requests_select" on public.vacation_requests
using (
  requester_app_user_id = auth.uid()
  or supervisor_app_user_id = auth.uid()
  or coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false)
);
