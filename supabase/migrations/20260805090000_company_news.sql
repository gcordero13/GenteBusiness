create table public.company_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_url text,
  link_url text,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint company_news_date_range_valid check (end_date >= start_date)
);

alter table public.company_news enable row level security;

create policy "company_news_select_any_authenticated" on public.company_news
for select
using ( auth.uid() is not null );

create policy "company_news_write_activities_managers" on public.company_news
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

create policy "company_news_update_activities_managers" on public.company_news
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

create policy "company_news_delete_activities_managers" on public.company_news
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do nothing;

create policy "news_images_public_read" on storage.objects
for select
using ( bucket_id = 'news-images' );

create policy "news_images_write_activities_managers" on storage.objects
for insert
with check (
  bucket_id = 'news-images'
  and coalesce((select can_manage from public.get_my_module_permissions('activities')), false)
);

create policy "news_images_update_activities_managers" on storage.objects
for update
using (
  bucket_id = 'news-images'
  and coalesce((select can_manage from public.get_my_module_permissions('activities')), false)
);

create policy "news_images_delete_activities_managers" on storage.objects
for delete
using (
  bucket_id = 'news-images'
  and coalesce((select can_manage from public.get_my_module_permissions('activities')), false)
);
