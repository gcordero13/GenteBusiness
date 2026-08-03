drop policy "maintenance_records_delete" on public.maintenance_records;

create policy "maintenance_records_delete" on public.maintenance_records
for delete
using (
  coalesce((select can_delete from public.get_my_module_permissions('maintenance')), false)
  and status = 'pendiente'
);
