-- Run manually, once, in the Supabase SQL Editor (or via psql) — not part of
-- the migration history. The target person must already have a row in
-- auth.users (e.g. they accepted an invite and set a password) before this
-- runs. Replace the email below before running.

insert into public.app_users (id, email, role_profile_id, full_name)
select
  u.id,
  u.email,
  (select id from public.role_profiles where name = 'Super Admin'),
  null
from auth.users u
where u.email = 'REPLACE_WITH_ADMIN_EMAIL@example.com'
on conflict (id) do update
  set role_profile_id = excluded.role_profile_id;
