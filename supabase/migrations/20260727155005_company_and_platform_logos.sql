alter table public.companies add column logo_url text;

create table public.platform_settings (
  id boolean primary key default true,
  logo_url text,
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_anyone" on public.platform_settings
for select
using ( true );

create policy "platform_settings_update_settings_managers" on public.platform_settings
for update
using ( true )
with check ( coalesce((select can_manage from public.get_my_module_permissions('settings')), false) );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 2097152, array['image/png','image/jpeg','image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "company_logos_public_read" on storage.objects
for select
using ( bucket_id = 'company-logos' );

create policy "company_logos_write_platform" on storage.objects
for insert
with check (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = 'platform'
  and coalesce((select can_manage from public.get_my_module_permissions('settings')), false)
);

create policy "company_logos_update_platform" on storage.objects
for update
using (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] = 'platform'
  and coalesce((select can_manage from public.get_my_module_permissions('settings')), false)
);

create policy "company_logos_write_companies" on storage.objects
for insert
with check (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] is null
  and coalesce((select can_manage from public.get_my_module_permissions('companies')), false)
);

create policy "company_logos_update_companies" on storage.objects
for update
using (
  bucket_id = 'company-logos'
  and (storage.foldername(name))[1] is null
  and coalesce((select can_manage from public.get_my_module_permissions('companies')), false)
);
