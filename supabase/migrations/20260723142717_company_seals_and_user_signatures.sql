create table public.company_seals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.user_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.company_seals enable row level security;
alter table public.user_signatures enable row level security;

create policy "company_seals_all_can_add" on public.company_seals
for all
using ( coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false) )
with check ( coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false) );

create policy "user_signatures_owner_only" on public.user_signatures
for all
using ( user_id = auth.uid() )
with check ( user_id = auth.uid() );

insert into storage.buckets (id, name, public)
values ('company-seals', 'company-seals', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('user-signatures', 'user-signatures', false)
on conflict (id) do nothing;

create policy "company_seals_storage_can_add" on storage.objects
for all
using (
  bucket_id = 'company-seals'
  and coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false)
)
with check (
  bucket_id = 'company-seals'
  and coalesce((select can_add from public.get_my_module_permissions('document_stamps')), false)
);

create policy "user_signatures_storage_owner_only" on storage.objects
for all
using (
  bucket_id = 'user-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-signatures'
  and (storage.foldername(name))[1] = auth.uid()::text
);
