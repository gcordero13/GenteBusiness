create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  extension text,
  fleet_phone text,
  has_whatsapp boolean not null default false,
  department_id uuid references public.departments (id),
  company_id uuid references public.companies (id),
  position text,
  photo_url text,
  reports_to_id uuid references public.contacts (id),
  birth_date date,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "contacts_select" on public.contacts
for select
using ( coalesce((select can_view from public.get_my_role_flags()), false) );

create policy "contacts_insert" on public.contacts
for insert
with check ( coalesce((select can_add from public.get_my_role_flags()), false) );

create policy "contacts_update" on public.contacts
for update
using (
  coalesce((select can_edit from public.get_my_role_flags()), false)
  or coalesce((select can_deactivate from public.get_my_role_flags()), false)
)
with check (
  coalesce((select can_edit from public.get_my_role_flags()), false)
  or coalesce((select can_deactivate from public.get_my_role_flags()), false)
);

create policy "contacts_delete" on public.contacts
for delete
using ( coalesce((select can_delete from public.get_my_role_flags()), false) );

-- RLS alone can't distinguish "changed status" from "changed other fields" within
-- a single UPDATE statement, so a trigger enforces the finer-grained rule from
-- the spec: editing content requires can_edit, changing status requires can_deactivate.
create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
begin
  select * into flags from public.get_my_role_flags();

  if flags is null then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.extension, new.fleet_phone, new.has_whatsapp,
    new.department_id, new.company_id, new.position, new.photo_url, new.reports_to_id, new.birth_date
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.extension, old.fleet_phone, old.has_whatsapp,
    old.department_id, old.company_id, old.position, old.photo_url, old.reports_to_id, old.birth_date
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_update_permission_check
before update on public.contacts
for each row execute function public.enforce_contacts_update_permissions();
