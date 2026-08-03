alter table public.maintenance_records
  alter column contact_id drop not null,
  alter column created_by drop not null;

alter table public.maintenance_records
  drop constraint maintenance_records_contact_id_fkey,
  add constraint maintenance_records_contact_id_fkey
    foreign key (contact_id) references public.contacts (id) on delete set null;

alter table public.maintenance_records
  drop constraint maintenance_records_created_by_fkey,
  add constraint maintenance_records_created_by_fkey
    foreign key (created_by) references public.app_users (id) on delete set null;

drop policy "maintenance_records_insert" on public.maintenance_records;
create policy "maintenance_records_insert" on public.maintenance_records
for insert
with check (
  coalesce((select can_add from public.get_my_module_permissions('maintenance')), false)
  and created_by = auth.uid()
);
