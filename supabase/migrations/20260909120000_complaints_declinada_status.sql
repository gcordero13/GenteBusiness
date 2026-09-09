-- Widens the status check constraint to allow "declinada" (a reviewer
-- declining/rejecting a complaint) - the app's UI for this 4th status was
-- already shipped; this migration is what actually makes it usable, since
-- 20260909100000_complaints_triage_and_attachments.sql only allowed
-- 'nuevo'/'en_proceso'/'resuelto'. Written to find and drop whatever the
-- current status check constraint is named (rather than assuming a specific
-- name), so it's safe to run regardless of whether an ad-hoc widening was
-- already applied directly against the live database with a different
-- constraint name.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.complaints'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.complaints drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.complaints add constraint complaints_status_check
  check (status in ('nuevo', 'en_proceso', 'resuelto', 'declinada'));
