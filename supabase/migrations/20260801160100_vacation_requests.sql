create table public.vacation_requests (
  id uuid primary key default gen_random_uuid(),

  contact_id uuid not null references public.contacts (id),
  requester_app_user_id uuid not null references public.app_users (id),

  -- Snapshotted from the requester's contact at submission time so later
  -- edits to their contact record don't retroactively change an in-flight
  -- request — same reasoning already used by maintenance_records.
  first_name text not null,
  last_name text not null,
  position text,
  company_name text,
  department_name text,

  period text,
  days_requested integer not null,
  date_from date not null,
  date_to date not null,
  return_date date not null,
  days_pending integer,
  notes text,

  status text not null default 'pendiente_supervisor'
    check (status in ('pendiente_supervisor', 'pendiente_rrhh', 'aprobado', 'rechazado')),

  -- Resolved via contacts.reports_to_id and snapshotted at submission time.
  supervisor_app_user_id uuid not null references public.app_users (id),
  supervisor_decision text check (supervisor_decision in ('aprobado', 'rechazado')),
  supervisor_decided_at timestamptz,
  supervisor_comments text,
  supervisor_signature_path text,

  rrhh_decision text check (rrhh_decision in ('aprobado', 'rechazado')),
  rrhh_decided_at timestamptz,
  rrhh_decided_by uuid references public.app_users (id),
  rrhh_comments text,
  rrhh_signature_path text,
  rrhh_period_confirmed text,
  rrhh_has_current_vacation boolean,
  rrhh_is_advance boolean,

  created_at timestamptz not null default now()
);

alter table public.vacation_requests enable row level security;

-- Baseline: the requester sees their own; the resolved supervisor sees what
-- they need to act on; can_view/can_authorize grant oversight beyond that.
create policy "vacation_requests_select" on public.vacation_requests
for select
using (
  requester_app_user_id = auth.uid()
  or supervisor_app_user_id = auth.uid()
  or coalesce((select can_view from public.get_my_module_permissions('solicitudes_vacaciones')), false)
  or coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false)
);

-- Anyone can submit their own request — no module permission required.
-- The supervisor_app_user_id value itself is resolved and validated by the
-- server action (via the admin client, since a plain user session can't
-- read a coworker's contact row) before this insert runs.
create policy "vacation_requests_insert_self" on public.vacation_requests
for insert
with check ( requester_app_user_id = auth.uid() );

-- The resolved supervisor may only act while the request is still awaiting
-- them; once it moves to RRHH this policy no longer applies to them.
create policy "vacation_requests_update_supervisor" on public.vacation_requests
for update
using ( supervisor_app_user_id = auth.uid() and status = 'pendiente_supervisor' )
with check ( supervisor_app_user_id = auth.uid() );

-- RRHH (can_authorize) may only act once the supervisor stage has passed.
create policy "vacation_requests_update_rrhh" on public.vacation_requests
for update
using (
  status = 'pendiente_rrhh'
  and coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false)
)
with check ( coalesce((select can_authorize from public.get_my_module_permissions('solicitudes_vacaciones')), false) );
