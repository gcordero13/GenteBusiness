create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  contact_id uuid not null references public.contacts (id),
  created_by uuid not null references public.app_users (id),

  -- Snapshot of the contact at creation time (see design spec: the signed
  -- report must reflect the contact's state on the day of the visit, not
  -- whatever it is later).
  first_name text not null,
  last_name text not null,
  position text,
  company_name text,
  department_name text,
  email text,

  host_name text,
  ram text,
  os text,
  storage_total text,
  storage_used text,
  storage_free text,

  -- Checklist — keep in sync with src/lib/maintenanceChecklist.ts.
  restore_point_created boolean,
  temp_files_cleaned boolean,
  disk_defragmented boolean,
  antivirus_updated boolean,
  windows_updated boolean,
  agenda_installed boolean,
  apps_match_profile boolean,
  wallpaper_installed boolean,
  keyboard_cleaned boolean,
  screen_cleaned boolean,

  findings text,
  observations text,

  technician_signature_path text,
  technician_signed_at timestamptz,
  user_signature_path text,
  user_signed_at timestamptz,

  status text not null default 'pendiente' check (status in ('pendiente', 'completado', 'expirado')),
  pdf_path text,
  email_error text,

  expires_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.maintenance_records enable row level security;

-- No update policy: authenticated technicians never edit a record's content
-- from inside the app. All content/signature writes to this table happen
-- through the public token routes via the service-role admin client, which
-- bypasses RLS entirely (the token itself is the credential there).
create policy "maintenance_records_select" on public.maintenance_records
for select
using ( coalesce((select can_view from public.get_my_module_permissions('maintenance')), false) );

create policy "maintenance_records_insert" on public.maintenance_records
for insert
with check ( coalesce((select can_add from public.get_my_module_permissions('maintenance')), false) );

create policy "maintenance_records_delete" on public.maintenance_records
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('maintenance')), false) );
