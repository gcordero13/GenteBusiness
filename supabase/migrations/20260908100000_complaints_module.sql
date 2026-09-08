create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null check (category in ('acoso', 'seguridad', 'etica', 'recursos_humanos', 'otro')),
  message text not null,
  is_anonymous boolean not null,
  contact_id uuid references public.contacts(id),
  check ((is_anonymous and contact_id is null) or (not is_anonymous))
);

alter table public.complaints enable row level security;
-- No insert policy at all - only submit_complaint() (security definer) may
-- write, same convention as time_clock_devices/time_clock_punches
-- (20260810120000_attendance_devices_and_punches.sql). This is what makes
-- anonymous submissions genuinely untraceable: there is no direct INSERT
-- path a client (or even a future admin query) could ever use to attach
-- identifying info to an anonymous row.

create table public.complaint_viewers (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (app_user_id)
);

alter table public.complaint_viewers enable row level security;

-- Central check: can the caller see complaints at all? Used both by the
-- complaints SELECT policy below and by the app to decide whether to show
-- the "Quejas" sidebar link / gate the review page.
create or replace function public.can_view_complaints()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.complaint_viewers cv where cv.app_user_id = auth.uid()
  );
$$;

create policy "complaints_select_viewers" on public.complaints
for select using (public.can_view_complaints());

-- Reuses the SAME "who administers this" gate already used for
-- role_profile_permissions (20260715120543_per_module_permissions.sql) - a
-- brand-new per-user access grant doesn't need a brand-new permission
-- concept just to control who can hand it out.
create policy "complaint_viewers_select_managers" on public.complaint_viewers
for select using (coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false));
create policy "complaint_viewers_write_managers" on public.complaint_viewers
for all using (coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false))
with check (coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false));

-- The ONLY way to create a complaint. Resolves the submitter's own
-- contact_id server-side (never accepts one as a parameter, so a client can
-- never supply someone else's identity) and only when p_is_anonymous is
-- false - when true, no identifying data is looked up or stored at all,
-- guaranteeing true anonymity even against direct database access.
create or replace function public.submit_complaint(p_category text, p_message text, p_is_anonymous boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  if not p_is_anonymous then
    select c.id into v_contact_id
    from public.contacts c
    where c.email = (select au.email from public.app_users au where au.id = auth.uid());
  end if;

  insert into public.complaints (category, message, is_anonymous, contact_id)
  values (p_category, p_message, p_is_anonymous, v_contact_id)
  returning id into v_id;

  return v_id;
end;
$$;
