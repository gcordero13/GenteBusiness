-- Tutorials for "Mi perfil" (user request, 2026-11-27): Mi perfil is not a
-- module - everyone has it - so a tutorial without module (module_key null)
-- is shown to every signed-in user, labeled "Mi perfil". Tutorials with a
-- module keep being shown only to people with permission on it.

alter table public.aprendizaje_tutoriales alter column module_key drop not null;

drop policy if exists "aprendizaje_tutoriales_select" on public.aprendizaje_tutoriales;
create policy "aprendizaje_tutoriales_select" on public.aprendizaje_tutoriales
  for select using (
    public.aprendizaje_can_manage()
    or (active and (module_key is null or public.aprendizaje_tiene_modulo(module_key)))
  );

create or replace function public.aprendizaje_tutoriales_pendientes()
returns table (
  tutorial_id uuid,
  title text,
  module_key text,
  module_label text,
  video_url text,
  video_drive_id text,
  video_item_id text,
  imagen_drive_id text,
  imagen_item_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.title, t.module_key, coalesce(m.label, 'Mi perfil'), t.video_url, t.video_drive_id, t.video_item_id, t.imagen_drive_id, t.imagen_item_id
  from aprendizaje_tutoriales t
  left join modules m on m.key = t.module_key
  where t.active
    and (t.module_key is null or public.aprendizaje_tiene_modulo(t.module_key))
    and not exists (
      select 1 from aprendizaje_tutoriales_vistos v
      where v.tutorial_id = t.id and v.app_user_id = auth.uid()
    )
  order by t.created_at desc;
$$;

create or replace function public.aprendizaje_tutorial_video_visible(p_drive_id text, p_item_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from aprendizaje_tutoriales t
    where (
        (t.video_drive_id = p_drive_id and t.video_item_id = p_item_id)
        or (t.imagen_drive_id = p_drive_id and t.imagen_item_id = p_item_id)
      )
      and (
        public.aprendizaje_can_manage()
        or (t.active and (t.module_key is null or public.aprendizaje_tiene_modulo(t.module_key)))
      )
  );
$$;
