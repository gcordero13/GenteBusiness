-- The request flow modal needs to show WHO the direct supervisor is (the
-- person at the top of the requester's org chart responsible for the
-- approval), but that name was never stored - only supervisor_app_user_id.
-- Snapshot it the same way first_name/last_name are already snapshotted for
-- the requester, so later contact edits don't retroactively change it.
alter table public.vacation_requests
  add column supervisor_first_name text,
  add column supervisor_last_name text;

-- Backfill existing/in-flight requests via the same email-join lookup used
-- when a request is first submitted (resolveVacationSupervisor.ts).
update public.vacation_requests vr
set supervisor_first_name = c.first_name,
    supervisor_last_name = c.last_name
from public.app_users au
join public.contacts c on c.email = au.email
where au.id = vr.supervisor_app_user_id
  and vr.supervisor_first_name is null;
