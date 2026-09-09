alter table public.complaints add column if not exists subject text not null default 'Sin asunto';

-- submit_complaint's parameter list is changing (new p_subject param), so the
-- old 4-arg overload must be dropped first - CREATE OR REPLACE does not
-- replace a function whose argument type list differs (learned earlier this
-- module: 20260909100000_complaints_triage_and_attachments.sql).
drop function if exists public.submit_complaint(text, text, boolean, text);

create or replace function public.submit_complaint(
  p_category text,
  p_message text,
  p_is_anonymous boolean,
  p_photo_path text default null,
  p_subject text default 'Sin asunto'
)
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

  if not p_is_anonymous and v_contact_id is null then
    raise exception 'could not resolve your contact record for a non-anonymous submission';
  end if;

  insert into public.complaints (category, message, is_anonymous, contact_id, photo_path, subject)
  values (p_category, p_message, p_is_anonymous, v_contact_id, p_photo_path, p_subject)
  returning id into v_id;

  return v_id;
end;
$$;

-- list_my_complaints' RETURNS TABLE shape is changing (new subject column) -
-- Postgres does not allow CREATE OR REPLACE FUNCTION to change a function's
-- return type/column list, so this also needs an explicit drop first.
drop function if exists public.list_my_complaints(uuid[]);

create or replace function public.list_my_complaints(p_anonymous_ids uuid[] default '{}')
returns table (
  id uuid,
  complaint_number bigint,
  created_at timestamptz,
  category text,
  subject text,
  message text,
  is_anonymous boolean,
  status text,
  reviewer_comment text,
  photo_path text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contact_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  select c.id into v_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  return query
    select
      cx.id, cx.complaint_number, cx.created_at, cx.category, cx.subject, cx.message,
      cx.is_anonymous, cx.status, cx.reviewer_comment, cx.photo_path
    from public.complaints cx
    where (v_contact_id is not null and cx.contact_id = v_contact_id)
       or (cx.is_anonymous and cx.id = any(p_anonymous_ids))
    order by cx.created_at desc;
end;
$$;
