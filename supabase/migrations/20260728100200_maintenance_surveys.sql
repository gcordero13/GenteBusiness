create table public.maintenance_surveys (
  id uuid primary key default gen_random_uuid(),
  maintenance_record_id uuid not null unique references public.maintenance_records (id) on delete cascade,
  technician_id uuid references public.app_users (id) on delete set null,
  token text not null unique,

  nps_score smallint check (nps_score between 0 and 10),
  quality_score smallint check (quality_score between 1 and 5),
  punctuality_score smallint check (punctuality_score between 1 and 5),
  professionalism_score smallint check (professionalism_score between 1 and 5),
  clarity_score smallint check (clarity_score between 1 and 5),
  comments text,

  status text not null default 'pendiente' check (status in ('pendiente', 'respondida')),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

alter table public.maintenance_surveys enable row level security;

-- Same reasoning as maintenance_records: insert/update happen exclusively
-- through the public /encuesta/[token] route via the admin client.
create policy "maintenance_surveys_select" on public.maintenance_surveys
for select
using ( coalesce((select can_view from public.get_my_module_permissions('maintenance')), false) );
