-- Supply requests: the employee-facing "Solicitud de suministros" flow.
-- Confirmed with the user across several rounds:
--   - One request per requester per calendar month (the partial unique
--     index below), unless an approved exception exists for that period.
--   - The approver is chosen by the requester from their own supervisor
--     chain (contacts.reports_to_id, resolved server-side) — not a
--     permission flag.
--   - Editing an already-approved request forces re-approval by the same
--     approver (the app sets status back to 'editada_pendiente_reaprobacion').
create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  request_number bigint generated always as identity,
  requester_app_user_id uuid not null references public.app_users(id),
  requester_name text not null,
  requester_department_name text,
  period_month date not null,
  status text not null default 'pendiente_aprobacion' check (status in (
    'pendiente_aprobacion',
    'aprobada',
    'editada_pendiente_reaprobacion',
    'rechazada',
    'en_preparacion',
    'parcial',
    'entregada',
    'cancelada'
  )),
  approver_app_user_id uuid references public.app_users(id),
  approver_name text not null,
  notes text,
  is_exception boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one non-exception, non-rejected/cancelled request per person per
-- month — an approved exception (supply_request_exceptions below) is what
-- lets a second one in for that period, flagged is_exception = true so it
-- falls outside this constraint.
create unique index supply_requests_one_per_period_idx
  on public.supply_requests (requester_app_user_id, period_month)
  where status not in ('rechazada', 'cancelada') and not is_exception;

create index supply_requests_requester_idx on public.supply_requests(requester_app_user_id);
create index supply_requests_approver_idx on public.supply_requests(approver_app_user_id);
create index supply_requests_status_idx on public.supply_requests(status);

create table public.supply_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supply_requests(id) on delete cascade,
  article_id uuid not null references public.supply_articles(id),
  -- Snapshots: the article's name/unit/price at request time, so a later
  -- rename or price change never rewrites what was actually requested, and
  -- spend-by-department reporting stays accurate historically.
  article_name text not null,
  unit text not null,
  unit_price numeric(10, 2) not null,
  qty_requested integer not null check (qty_requested > 0),
  qty_approved integer,
  qty_prepared integer,
  qty_delivered integer
);

create index supply_request_items_request_idx on public.supply_request_items(request_id);

-- The "fuera de ciclo" exception workflow: a requester who already used
-- their one request this month asks their approver to open a second one,
-- with a note explaining why.
create table public.supply_request_exceptions (
  id uuid primary key default gen_random_uuid(),
  requester_app_user_id uuid not null references public.app_users(id),
  period_month date not null,
  note text not null,
  approver_app_user_id uuid not null references public.app_users(id),
  approver_name text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index supply_request_exceptions_requester_idx on public.supply_request_exceptions(requester_app_user_id);

alter table public.supply_requests enable row level security;
alter table public.supply_request_items enable row level security;
alter table public.supply_request_exceptions enable row level security;

create policy "supply_requests_select" on public.supply_requests
  for select
  using (
    requester_app_user_id = auth.uid()
    or approver_app_user_id = auth.uid()
    or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
    or coalesce((select can_authorize from public.get_my_module_permissions('suministros')), false)
  );

create policy "supply_requests_insert_own" on public.supply_requests
  for insert
  with check (requester_app_user_id = auth.uid());

create policy "supply_requests_update" on public.supply_requests
  for update
  using (
    requester_app_user_id = auth.uid()
    or approver_app_user_id = auth.uid()
    or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
  )
  with check (
    requester_app_user_id = auth.uid()
    or approver_app_user_id = auth.uid()
    or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
  );

create policy "supply_request_items_select" on public.supply_request_items
  for select
  using (
    exists (
      select 1 from public.supply_requests r
      where r.id = request_id
        and (
          r.requester_app_user_id = auth.uid()
          or r.approver_app_user_id = auth.uid()
          or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
          or coalesce((select can_authorize from public.get_my_module_permissions('suministros')), false)
        )
    )
  );

create policy "supply_request_items_insert" on public.supply_request_items
  for insert
  with check (
    exists (
      select 1 from public.supply_requests r
      where r.id = request_id and r.requester_app_user_id = auth.uid()
    )
  );

create policy "supply_request_items_update" on public.supply_request_items
  for update
  using (
    exists (
      select 1 from public.supply_requests r
      where r.id = request_id
        and (
          r.requester_app_user_id = auth.uid()
          or r.approver_app_user_id = auth.uid()
          or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
        )
    )
  );

create policy "supply_request_exceptions_select" on public.supply_request_exceptions
  for select
  using (
    requester_app_user_id = auth.uid()
    or approver_app_user_id = auth.uid()
    or coalesce((select can_manage from public.get_my_module_permissions('suministros')), false)
  );

create policy "supply_request_exceptions_insert_own" on public.supply_request_exceptions
  for insert
  with check (requester_app_user_id = auth.uid());

create policy "supply_request_exceptions_update_approver" on public.supply_request_exceptions
  for update
  using (approver_app_user_id = auth.uid())
  with check (approver_app_user_id = auth.uid());

create or replace function public.set_supply_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger supply_requests_set_updated_at
  before update on public.supply_requests
  for each row
  execute function public.set_supply_requests_updated_at();
