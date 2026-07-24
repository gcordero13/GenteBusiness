alter table public.app_users
  add column status text not null default 'active' check (status in ('active', 'deactivated'));
