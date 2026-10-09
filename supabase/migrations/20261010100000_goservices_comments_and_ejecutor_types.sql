-- Comment history on a request — multiple entries over time, each
-- attributed to its author, rather than a single overwritable field.
-- Visible to anyone who can see the parent request (requester, assignee, or
-- a gestor); only the assignee or a gestor may add one (the requester can
-- read the conversation but doesn't participate in it).
create table public.goservices_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.goservices_requests (id) on delete cascade,
  author_app_user_id uuid not null references public.app_users (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index goservices_request_comments_request_idx on public.goservices_request_comments (request_id);

alter table public.goservices_request_comments enable row level security;

create policy "goservices_request_comments_select" on public.goservices_request_comments
  for select
  using (
    exists (
      select 1 from public.goservices_requests gr
      where gr.id = request_id
        and (
          gr.requester_app_user_id = auth.uid()
          or gr.assigned_app_user_id = auth.uid()
          or coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
        )
    )
  );

create policy "goservices_request_comments_insert" on public.goservices_request_comments
  for insert
  with check (
    author_app_user_id = auth.uid()
    and exists (
      select 1 from public.goservices_requests gr
      where gr.id = request_id
        and (
          gr.assigned_app_user_id = auth.uid()
          or coalesce((select can_view from public.get_my_module_permissions('goservices')), false)
        )
    )
  );

-- Ejecutor eligibility is now split by request type: can_add = eligible for
-- mantenimiento tickets, can_edit = eligible for mensajería tickets (both
-- repurposed existing role_profile_permissions columns on the goservices
-- module — no new table, same approach as the original can_add backfill).
-- can_view continues to mean gestor, unaffected.
update public.role_profile_permissions rpp
set can_edit = true
from public.modules m, public.role_profiles rp
where rpp.module_id = m.id
  and rpp.role_profile_id = rp.id
  and m.key = 'goservices'
  and rp.name = 'Super Admin';
