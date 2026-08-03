create table public.email_settings (
  id boolean primary key default true,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_pass text,
  smtp_sender_name text,
  smtp_admin_email text,
  updated_at timestamptz not null default now(),
  constraint email_settings_singleton check (id)
);

insert into public.email_settings (id) values (true);

alter table public.email_settings enable row level security;
-- No policies: this table holds an SMTP password. It is written only by
-- saveSmtpSettings (via the admin client, after an explicit
-- get_my_module_permissions('settings').can_manage check in application
-- code) and read only by the maintenance email-sending code (also via the
-- admin client). RLS enabled with zero policies denies the anon and
-- authenticated roles entirely.
