-- Reverts the earlier pending-only delete restriction: users with can_delete
-- on the maintenance module may now delete a record in any status, so real
-- test/mistaken records (including completed ones) can be cleaned up.
drop policy "maintenance_records_delete" on public.maintenance_records;

create policy "maintenance_records_delete" on public.maintenance_records
for delete
using (
  coalesce((select can_delete from public.get_my_module_permissions('maintenance')), false)
);
