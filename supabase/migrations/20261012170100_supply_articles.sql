-- First piece of the Suministros module: the article/product catalog.
-- Requests, dispatch, and the kanban board (which reference articles) land
-- in a follow-up migration once their own action code is written.
create table public.supply_articles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  category text,
  unit text not null,
  price numeric(10, 2) not null default 0,
  stock_quantity integer not null default 0,
  low_stock_threshold integer not null default 0,
  -- A link to an externally-hosted image, not an upload — confirmed with
  -- the user ("quiero poder ponerle un link de la imagen para no cargar la
  -- imagen como tal").
  image_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supply_articles_status_idx on public.supply_articles(status);

alter table public.supply_articles enable row level security;

-- Every authenticated user can browse the catalog (needed to build a
-- request); only a despachador (can_manage) can create/edit/deactivate
-- articles.
create policy "supply_articles_select_all" on public.supply_articles
  for select
  using (auth.uid() is not null);

create policy "supply_articles_insert_managers" on public.supply_articles
  for insert
  with check (coalesce((select can_manage from public.get_my_module_permissions('suministros')), false));

create policy "supply_articles_update_managers" on public.supply_articles
  for update
  using (coalesce((select can_manage from public.get_my_module_permissions('suministros')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('suministros')), false));

create policy "supply_articles_delete_managers" on public.supply_articles
  for delete
  using (coalesce((select can_manage from public.get_my_module_permissions('suministros')), false));

create or replace function public.set_supply_articles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger supply_articles_set_updated_at
  before update on public.supply_articles
  for each row
  execute function public.set_supply_articles_updated_at();
