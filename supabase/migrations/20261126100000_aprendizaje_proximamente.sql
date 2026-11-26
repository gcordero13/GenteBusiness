-- "Próximamente" on the Aprendizaje portal: drafts a manager chose to
-- announce. Learners can't read drafts through RLS, so this definer
-- function exposes only their teaser fields (no lessons, files or cover).
alter table public.aprendizaje_cursos
  add column anunciar_proximamente boolean not null default false;

create or replace function public.aprendizaje_proximamente()
returns table (id uuid, title text, description text, category text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.description, c.category
  from aprendizaje_cursos c
  where c.status = 'borrador' and c.anunciar_proximamente and public.aprendizaje_can_view()
  order by c.updated_at desc;
$$;

revoke execute on function public.aprendizaje_proximamente() from public, anon;
grant execute on function public.aprendizaje_proximamente() to authenticated;
