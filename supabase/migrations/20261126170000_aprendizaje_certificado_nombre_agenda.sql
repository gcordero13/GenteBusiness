-- The certificate printed the person's email (user report, 2026-11-26):
-- app_users.full_name is empty for most people. Take the name from their
-- Agenda contact instead, matched by email like the Aprendizaje portal does
-- (getMiPerfil), then full_name, and only then the email.

create or replace function public.aprendizaje_nombre_persona(p_app_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select nullif(btrim(concat_ws(' ', btrim(c.first_name), btrim(c.last_name))), '')
      from contacts c
      where c.email is not null and lower(btrim(c.email)) = lower(btrim(u.email))
      order by (c.status = 'active') desc, c.updated_at desc
      limit 1
    ),
    nullif(btrim(u.full_name), ''),
    u.email
  )
  from app_users u
  where u.id = p_app_user_id;
$$;

revoke execute on function public.aprendizaje_nombre_persona(uuid) from public, anon, authenticated;

create or replace function public.aprendizaje_mi_certificado(p_curso_id uuid)
returns table (
  codigo text,
  nombre text,
  curso_title text,
  completed_at timestamptz,
  firma_nombre text,
  firma_cargo text,
  firma_drive_id text,
  firma_item_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.certificado_codigo,
         public.aprendizaje_nombre_persona(i.app_user_id),
         c.title,
         i.completed_at,
         c.firma_nombre,
         c.firma_cargo,
         c.firma_drive_id,
         c.firma_item_id
  from aprendizaje_inscripciones i
  join aprendizaje_cursos c on c.id = i.curso_id
  where i.curso_id = p_curso_id
    and i.app_user_id = auth.uid()
    and i.completed_at is not null;
$$;

create or replace function public.aprendizaje_verificar_certificado(p_codigo text)
returns table (nombre text, curso_title text, completed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select public.aprendizaje_nombre_persona(i.app_user_id), c.title, i.completed_at
  from aprendizaje_inscripciones i
  join aprendizaje_cursos c on c.id = i.curso_id
  where i.certificado_codigo = upper(btrim(p_codigo))
    and i.completed_at is not null;
$$;
