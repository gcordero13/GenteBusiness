-- Admin-client-only, same reasoning as email_settings: this bucket only ever
-- gets written by the respond-as-supervisor/respond-as-rrhh server actions
-- (which use the admin client after their own application-level checks),
-- and only ever read via server-generated signed URLs. RLS enabled with zero
-- policies denies the anon and authenticated roles entirely.
insert into storage.buckets (id, name, public)
values ('vacation-request-signatures', 'vacation-request-signatures', false)
on conflict (id) do nothing;
