insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do nothing;

create policy "contact_photos_public_read" on storage.objects
for select
using ( bucket_id = 'contact-photos' );

create policy "contact_photos_write_can_add_or_edit" on storage.objects
for insert
with check (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_role_flags()), false)
    or coalesce((select can_edit from public.get_my_role_flags()), false)
  )
);

create policy "contact_photos_update_can_add_or_edit" on storage.objects
for update
using (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_role_flags()), false)
    or coalesce((select can_edit from public.get_my_role_flags()), false)
  )
);

create policy "contact_photos_delete_can_edit" on storage.objects
for delete
using (
  bucket_id = 'contact-photos'
  and coalesce((select can_edit from public.get_my_role_flags()), false)
);
