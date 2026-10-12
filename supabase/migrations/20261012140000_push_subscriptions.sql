-- Stores one row per browser/device a user has granted push-notification
-- permission on (a user can have several — phone + desktop, etc.). Built as
-- a general-purpose store even though only GoServices sends push for now
-- (confirmed with the user) — the table itself has no GoServices-specific
-- shape, so other modules can reuse it later without a schema change.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_app_user_id_idx on public.push_subscriptions(app_user_id);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions directly; sending push
-- notifications happens server-side via the admin client (bypasses RLS),
-- same pattern as every other notification path in this app.
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select
  using (app_user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert
  with check (app_user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete
  using (app_user_id = auth.uid());
