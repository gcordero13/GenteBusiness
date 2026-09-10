-- Remap existing rows to their new category slugs before tightening the
-- check constraint below (Postgres validates existing data against a new
-- CHECK constraint, so stale values must be migrated first). Safe to re-run:
-- these UPDATEs are no-ops once applied (WHERE clause won't match anything
-- a second time).
update public.complaints set category = 'maltrato_acoso' where category = 'acoso';
update public.complaints set category = 'otros' where category in ('recursos_humanos', 'otro');

-- Replace whatever check constraint currently governs "category" (found
-- dynamically, not assumed by name - mirrors the same technique used in
-- 20260909120000_complaints_declinada_status.sql for the status column)
-- with the new 6-value set: etica, malas_practicas, conflicto_interes,
-- maltrato_acoso, seguridad, otros.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.complaints'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%category%'
  loop
    execute format('alter table public.complaints drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.complaints add constraint complaints_category_check
  check (category in ('etica', 'malas_practicas', 'conflicto_interes', 'maltrato_acoso', 'seguridad', 'otros'));
