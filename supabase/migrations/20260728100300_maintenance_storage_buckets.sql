insert into storage.buckets (id, name, public)
values ('maintenance-signatures', 'maintenance-signatures', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('maintenance-reports', 'maintenance-reports', false)
on conflict (id) do nothing;

-- Deliberately no storage.objects policies for these two buckets: every read
-- and write goes through the service-role admin client from Server Actions
-- (technician-side downloads use signed URLs generated server-side; the
-- public token routes upload/download directly with the admin client). RLS
-- is enabled by default on storage.objects with zero policies, which denies
-- all access to the anon/authenticated roles — exactly what we want here.
