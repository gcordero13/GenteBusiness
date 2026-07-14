create table public.role_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_deactivate boolean not null default false,
  can_manage_platform boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.role_profiles (name, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage_platform)
values
  ('Viewer', true, false, false, false, false, false),
  ('Editor', true, true, true, false, true, false),
  ('Super Admin', true, true, true, true, true, true)
on conflict (name) do nothing;
