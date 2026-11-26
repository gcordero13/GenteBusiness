-- Certificates (Fase 4, approved design 2026-11-26).
-- * Who signs each course's certificate (name, position and a signature
--   image stored in SharePoint like the cover).
-- * A random verification code per enrollment, printed with a QR on the PDF.
-- * aprendizaje_mi_certificado: the caller's own certificate, only once the
--   course is completed.
-- * aprendizaje_verificar_certificado: public check behind the QR (anon);
--   returns only name, course and date.

alter table public.aprendizaje_cursos
  add column firma_nombre text,
  add column firma_cargo text,
  add column firma_drive_id text,
  add column firma_item_id text,
  add constraint aprendizaje_cursos_firma_ref_chk
    check ((firma_drive_id is null) = (firma_item_id is null));

-- 12 random hex digits (48 bits) as XXXX-XXXX-XXXX.
create or replace function public.aprendizaje_nuevo_codigo()
returns text
language sql
volatile
set search_path = public
as $$
  select substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4)
  from (select upper(replace(gen_random_uuid()::text, '-', '')) as h) x;
$$;

-- A volatile default gives every existing row its own code.
alter table public.aprendizaje_inscripciones
  add column certificado_codigo text not null default public.aprendizaje_nuevo_codigo();
alter table public.aprendizaje_inscripciones
  add constraint aprendizaje_inscripciones_certificado_codigo_key unique (certificado_codigo);

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
         coalesce(nullif(btrim(u.full_name), ''), u.email),
         c.title,
         i.completed_at,
         c.firma_nombre,
         c.firma_cargo,
         c.firma_drive_id,
         c.firma_item_id
  from aprendizaje_inscripciones i
  join aprendizaje_cursos c on c.id = i.curso_id
  join app_users u on u.id = i.app_user_id
  where i.curso_id = p_curso_id
    and i.app_user_id = auth.uid()
    and i.completed_at is not null;
$$;

revoke execute on function public.aprendizaje_mi_certificado(uuid) from public, anon;
grant execute on function public.aprendizaje_mi_certificado(uuid) to authenticated;

create or replace function public.aprendizaje_verificar_certificado(p_codigo text)
returns table (nombre text, curso_title text, completed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(u.full_name), ''), u.email), c.title, i.completed_at
  from aprendizaje_inscripciones i
  join aprendizaje_cursos c on c.id = i.curso_id
  join app_users u on u.id = i.app_user_id
  where i.certificado_codigo = upper(btrim(p_codigo))
    and i.completed_at is not null;
$$;

revoke execute on function public.aprendizaje_verificar_certificado(text) from public;
grant execute on function public.aprendizaje_verificar_certificado(text) to anon, authenticated;
