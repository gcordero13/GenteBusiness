# Planificación — Proyectos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Planificación module's POA screens with a generic, Plane-inspired "Proyectos" system — a tree of nested tasks per project, access controlled by ownership/assignment/delegable branch-level sharing instead of role profiles, with per-project custom states, Ciclos, Módulos, SharePoint-backed attachments, and four interchangeable views (Lista, Tablero, Calendario, Jerarquía).

**Architecture:** Every `plan_*` table is protected by RLS implementing the spec's visibility rule directly in Postgres via two small SQL helper functions (`plan_can_see_proyecto`/`plan_can_edit_proyecto`, extended by `plan_can_see_tarea`/`plan_can_edit_tarea`), so server actions never need an admin-client-bypass-plus-manual-check like every other module this app has built — they just query with the plain session client and let RLS do the enforcement. A materialized `ancestor_ids uuid[]` array (maintained by a trigger) makes "is this task visible via an ancestor's share" a fast indexed array check instead of a recursive query. Screens reuse this codebase's established "one workspace component owns view-mode state, renders interchangeable sub-views off one fetched list" pattern (Suministros, Servicios Generales) and the existing native-HTML5-drag-and-drop board/calendar patterns (GoServices, Servicios Generales).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (Postgres + RLS), Bun (no node.exe — `bun`/`bunx` only), Tailwind, shadcn-style UI components in `src/components/ui/`.

**Testing approach:** Matching this week's established precedent (GoServices enhancements, Suministros, Servicios Generales, the POA delivery) — no new automated tests. Verification is `bunx tsc --noEmit` + `bunx eslint <files>` + a final `bun run build`, with a manual smoke-test script at the end. Do not run the full `bun test` suite.

**Environment constraints:**
- No `node`/`npm`/`npx` — always `bun`/`bunx`.
- This machine's Supabase CLI credentials are invalid — every migration task ends with a **STOP**: hand the user the exact `.sql` file, and don't start a task that queries the new tables/columns until they confirm it ran.
- Work happens directly on `main` in `c:\Users\gcordero\Documents\GitHub\GenteBusiness` — no worktree, matching this week's practice.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, written to a temp file and committed with `git commit -F <file>`.
- Never run `bunx vercel --prod` without the user's explicit "sí, despliega" first.

**What happens to POA:** per the approved spec, POA is retired, not migrated. The 4 existing screens (`/planificacion/poas`, `/planificacion/equipo`, `/planificacion/puestos`, `/planificacion/lideres`), their `actions.ts`/`ComplianceView.tsx`/`ExportButton.tsx`, and their database tables (`poas`, `poa_objectives`, `poa_objective_updates`, `poa_positions`, `poa_position_objectives`, `planificacion_department_leaders`, `contacts.poa_position_id`) are **left in place, untouched** — only the Sidebar stops linking to them (Task 17). Deleting working production code/data without being asked is unnecessary risk; if the user later wants it actually removed, that's a separate, explicit request.

---

## File Structure

```
supabase/migrations/
  20261026100000_plan_proyectos.sql          (Task 1 — plan_proyectos, plan_proyecto_compartidos, visibility functions)
  20261026100100_plan_estados.sql            (Task 2 — plan_estados)
  20261026100200_plan_ciclos_modulos.sql     (Task 3 — plan_ciclos, plan_modulos)
  20261026100300_plan_tareas.sql             (Task 4 — plan_tareas + trigger, plan_tarea_modulos, plan_tarea_compartidos, plan_tarea_adjuntos)

src/lib/sharepoint.ts                         (Task 6 — add uploadSharePointAttachment, generalized beyond photos)

src/app/api/planificacion/adjunto/[driveId]/[itemId]/route.ts   (Task 6 — attachment viewer route)

src/app/(app)/planificacion/
  page.tsx                                    (Task 15 — NEW landing: Mis tareas / Compartido conmigo)
  proyectos/
    actions.ts                                (Task 5 — proyecto CRUD + listTareasVisibles; Task 6 appends tarea CRUD + attachments; Task 7 appends estados; Task 8 appends ciclos; Task 9 appends módulos; Task 10 appends sharing)
    ProyectosWorkspace.tsx                     (Task 15 — shared view-switcher, used by landing AND detail page)
    TareaCreateDialog.tsx                      (Task 6)
    TareaDetailModal.tsx                       (Task 6)
    EstadosEditor.tsx                          (Task 7)
    CiclosManager.tsx                          (Task 8)
    ModulosManager.tsx                         (Task 9)
    CompartirDialog.tsx                        (Task 10)
    ListaView.tsx                              (Task 11)
    TableroView.tsx                            (Task 12)
    CalendarioView.tsx                         (Task 13)
    JerarquiaView.tsx                          (Task 14)
    [id]/
      page.tsx                                 (Task 16 — project detail screen)

src/app/(app)/Sidebar.tsx                      (modify — Task 17)
src/app/(app)/layout.tsx                       (modify — Task 17)
```

Nothing under the existing `src/app/(app)/planificacion/poas|equipo|puestos|lideres/` directories, nor the existing root `src/app/(app)/planificacion/actions.ts`/`ComplianceView.tsx`/`ExportButton.tsx`, is touched by this plan.

---

### Task 1: `plan_proyectos`, sharing, and the core visibility functions

**Files:**
- Create: `supabase/migrations/20261026100000_plan_proyectos.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Root container of the new Plane-inspired Proyectos system. Any
-- authenticated user can create one (no role-profile gate, unlike every
-- other module in this app - confirmed explicitly with the user: access
-- here is controlled by ownership/sharing, not by Perfiles de rol).
create table public.plan_proyectos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.app_users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Sharing the whole project is equivalent to sharing its entire task tree.
create table public.plan_proyecto_compartidos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  shared_with_app_user_id uuid not null references public.app_users(id) on delete cascade,
  access_level text not null check (access_level in ('ver', 'editar')),
  shared_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (proyecto_id, shared_with_app_user_id)
);

alter table public.plan_proyectos enable row level security;
alter table public.plan_proyecto_compartidos enable row level security;

-- Core visibility functions, reused by every plan_* table's RLS so the
-- rule lives in exactly one place instead of being re-derived per table
-- (the risk flagged in this plan's own self-review: drift between
-- policies). SECURITY DEFINER so they can read plan_proyectos/
-- plan_proyecto_compartidos regardless of the calling role's own RLS
-- visibility of those rows (otherwise checking visibility would require
-- already having visibility - a chicken-and-egg problem).
create or replace function public.plan_can_see_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plan_proyectos p
    where p.id = p_proyecto_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1 from public.plan_proyecto_compartidos pc
          where pc.proyecto_id = p.id and pc.shared_with_app_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.plan_can_edit_proyecto(p_proyecto_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plan_proyectos p
    where p.id = p_proyecto_id
      and (
        p.created_by = auth.uid()
        or exists (
          select 1 from public.plan_proyecto_compartidos pc
          where pc.proyecto_id = p.id and pc.shared_with_app_user_id = auth.uid() and pc.access_level = 'editar'
        )
      )
  );
$$;

create policy "plan_proyectos_select" on public.plan_proyectos
  for select
  using (public.plan_can_see_proyecto(id));

create policy "plan_proyectos_insert" on public.plan_proyectos
  for insert
  with check (created_by = auth.uid());

create policy "plan_proyectos_update" on public.plan_proyectos
  for update
  using (public.plan_can_edit_proyecto(id))
  with check (public.plan_can_edit_proyecto(id));

-- Deleting a whole project is more destructive than editing it - restricted
-- to the creator only, not to every editar-level share holder.
create policy "plan_proyectos_delete" on public.plan_proyectos
  for delete
  using (created_by = auth.uid());

create policy "plan_proyecto_compartidos_select" on public.plan_proyecto_compartidos
  for select
  using (public.plan_can_see_proyecto(proyecto_id));

-- Sharing/revoking requires editar access to the project - a ver-only
-- recipient cannot grant access to others (an explicit, deliberate
-- interpretation of "delegable sharing": delegation requires meaningful
-- access, not mere visibility).
create policy "plan_proyecto_compartidos_write" on public.plan_proyecto_compartidos
  for all
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));
```

- [ ] **Step 2: STOP — hand this file to the user**

Say (in Spanish): "Necesito que corras esta migración en el SQL Editor de Supabase antes de seguir: `supabase/migrations/20261026100000_plan_proyectos.sql`." Paste the contents. Wait for explicit confirmation before Task 2.

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261026100000_plan_proyectos.sql"
git commit -F "$env:TEMP\claude\commit-msg-plan-proyectos.txt"
```

---

### Task 2: `plan_estados`

**Files:**
- Create: `supabase/migrations/20261026100100_plan_estados.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-project custom status columns (not a fixed company-wide enum like
-- GoServices/Servicios Generales use) - confirmed with the user, closer
-- to real Plane's per-project workflow states.
create table public.plan_estados (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0
);

alter table public.plan_estados enable row level security;

create policy "plan_estados_select" on public.plan_estados
  for select
  using (public.plan_can_see_proyecto(proyecto_id));

create policy "plan_estados_write" on public.plan_estados
  for all
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));
```

- [ ] **Step 2: STOP — hand this file to the user, wait for confirmation**

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261026100100_plan_estados.sql"
git commit -F "$env:TEMP\claude\commit-msg-plan-estados.txt"
```

---

### Task 3: `plan_ciclos` and `plan_modulos`

**Files:**
- Create: `supabase/migrations/20261026100200_plan_ciclos_modulos.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Named "plan_ciclos"/"plan_modulos" (not "ciclos"/"modulos") to avoid any
-- confusion with the existing public.modules table that drives this app's
-- entire role-profile permission system - unrelated concept, same word.
create table public.plan_ciclos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.plan_modulos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.plan_ciclos enable row level security;
alter table public.plan_modulos enable row level security;

create policy "plan_ciclos_select" on public.plan_ciclos
  for select using (public.plan_can_see_proyecto(proyecto_id));
create policy "plan_ciclos_write" on public.plan_ciclos
  for all using (public.plan_can_edit_proyecto(proyecto_id)) with check (public.plan_can_edit_proyecto(proyecto_id));

create policy "plan_modulos_select" on public.plan_modulos
  for select using (public.plan_can_see_proyecto(proyecto_id));
create policy "plan_modulos_write" on public.plan_modulos
  for all using (public.plan_can_edit_proyecto(proyecto_id)) with check (public.plan_can_edit_proyecto(proyecto_id));
```

- [ ] **Step 2: STOP — hand this file to the user, wait for confirmation**

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261026100200_plan_ciclos_modulos.sql"
git commit -F "$env:TEMP\claude\commit-msg-plan-ciclos-modulos.txt"
```

---

### Task 4: `plan_tareas` — the core tree, with the ancestor-tracking trigger and cascading share RLS

**Files:**
- Create: `supabase/migrations/20261026100300_plan_tareas.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.plan_tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  parent_task_id uuid references public.plan_tareas(id) on delete cascade,
  ancestor_ids uuid[] not null default '{}',
  title text not null,
  description text,
  estado_id uuid references public.plan_estados(id),
  priority text check (priority in ('alta', 'media', 'baja')),
  labels text[] not null default '{}',
  start_date date,
  due_date date,
  assignee_id uuid references public.app_users(id),
  ciclo_id uuid references public.plan_ciclos(id),
  created_by uuid not null references public.app_users(id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index plan_tareas_ancestor_ids_idx on public.plan_tareas using gin (ancestor_ids);
create index plan_tareas_proyecto_id_idx on public.plan_tareas (proyecto_id);
create index plan_tareas_parent_task_id_idx on public.plan_tareas (parent_task_id);

-- Maintains ancestor_ids automatically: a child always inherits its
-- parent's full ancestor_ids plus the parent's own id. Runs BEFORE INSERT
-- so sharing visibility (which reads ancestor_ids) is correct from the
-- very first row. App code passes parent_task_id; it never computes
-- ancestor_ids itself (the only source of truth is this trigger).
create or replace function public.plan_set_tarea_ancestor_ids()
returns trigger
language plpgsql
as $$
declare
  parent_row public.plan_tareas%rowtype;
begin
  if new.parent_task_id is null then
    new.ancestor_ids := '{}';
  else
    select * into parent_row from public.plan_tareas where id = new.parent_task_id;
    if not found then
      raise exception 'parent_task_id % no existe', new.parent_task_id;
    end if;
    new.ancestor_ids := parent_row.ancestor_ids || parent_row.id;
  end if;
  return new;
end;
$$;

create trigger plan_tareas_set_ancestor_ids
  before insert on public.plan_tareas
  for each row
  execute function public.plan_set_tarea_ancestor_ids();

alter table public.plan_tareas enable row level security;

-- A task is visible if its project is visible at all (owner or any share
-- level), OR the caller owns/is assigned to the task directly, OR the
-- task itself (or any ancestor, via the materialized array) was shared
-- with the caller. Ownership/assignment always wins regardless of any
-- inherited ver-level share - checked directly here, not derived from a
-- share row, so it can never be weakened by a share's access_level.
create or replace function public.plan_can_see_tarea(p_tarea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.plan_tareas t
    where t.id = p_tarea_id
      and (
        public.plan_can_see_proyecto(t.proyecto_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
        )
      )
  );
$$;

create or replace function public.plan_can_edit_tarea(p_tarea_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.plan_tareas t
    where t.id = p_tarea_id
      and (
        public.plan_can_edit_proyecto(t.proyecto_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.plan_tarea_compartidos tc
          where tc.shared_with_app_user_id = auth.uid()
            and tc.tarea_id = any (t.ancestor_ids || t.id)
            and tc.access_level = 'editar'
        )
      )
  );
$$;

create policy "plan_tareas_select" on public.plan_tareas
  for select
  using (public.plan_can_see_tarea(id));

-- Creating a root task (no parent) requires editar on the project;
-- creating a child requires editar on the parent task specifically (not
-- just "somewhere in the project"), so a ver-only project share, or a
-- share scoped to a sibling branch, can't be used to add tasks under a
-- branch the caller doesn't actually have edit rights to.
create policy "plan_tareas_insert" on public.plan_tareas
  for insert
  with check (
    created_by = auth.uid()
    and (
      (parent_task_id is null and public.plan_can_edit_proyecto(proyecto_id))
      or (parent_task_id is not null and public.plan_can_edit_tarea(parent_task_id))
    )
  );

create policy "plan_tareas_update" on public.plan_tareas
  for update
  using (public.plan_can_edit_tarea(id))
  with check (public.plan_can_edit_tarea(id));

create policy "plan_tareas_delete" on public.plan_tareas
  for delete
  using (public.plan_can_edit_tarea(id));

create table public.plan_tarea_modulos (
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  modulo_id uuid not null references public.plan_modulos(id) on delete cascade,
  primary key (tarea_id, modulo_id)
);
alter table public.plan_tarea_modulos enable row level security;
create policy "plan_tarea_modulos_select" on public.plan_tarea_modulos
  for select using (public.plan_can_see_tarea(tarea_id));
create policy "plan_tarea_modulos_write" on public.plan_tarea_modulos
  for all using (public.plan_can_edit_tarea(tarea_id)) with check (public.plan_can_edit_tarea(tarea_id));

-- Sharing/revoking a task requires editar on it - same "delegation
-- requires meaningful access" rule as plan_proyecto_compartidos_write.
create table public.plan_tarea_compartidos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  shared_with_app_user_id uuid not null references public.app_users(id) on delete cascade,
  access_level text not null check (access_level in ('ver', 'editar')),
  shared_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (tarea_id, shared_with_app_user_id)
);
alter table public.plan_tarea_compartidos enable row level security;
create policy "plan_tarea_compartidos_select" on public.plan_tarea_compartidos
  for select using (public.plan_can_see_tarea(tarea_id));
create policy "plan_tarea_compartidos_write" on public.plan_tarea_compartidos
  for all using (public.plan_can_edit_tarea(tarea_id)) with check (public.plan_can_edit_tarea(tarea_id));

create table public.plan_tarea_adjuntos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  file_name text not null,
  content_type text,
  drive_id text not null,
  item_id text not null,
  uploaded_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);
alter table public.plan_tarea_adjuntos enable row level security;
create policy "plan_tarea_adjuntos_select" on public.plan_tarea_adjuntos
  for select using (public.plan_can_see_tarea(tarea_id));
create policy "plan_tarea_adjuntos_write" on public.plan_tarea_adjuntos
  for all using (public.plan_can_edit_tarea(tarea_id)) with check (public.plan_can_edit_tarea(tarea_id));
```

- [ ] **Step 2: STOP — hand this file to the user, wait for confirmation**

This is the last migration in this delivery. Do not start Task 5 until the user confirms it ran successfully.

- [ ] **Step 3: Commit**

```powershell
git add "supabase/migrations/20261026100300_plan_tareas.sql"
git commit -F "$env:TEMP\claude\commit-msg-plan-tareas.txt"
```

---

### Task 5: Shared actions — proyecto CRUD and the combined task list

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/actions.ts`

- [ ] **Step 1: Write the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface ActionResult {
  error?: string;
}

export interface ProyectoRow {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  archived: boolean;
}

export async function createProyecto(name: string, description: string): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!name.trim()) return { error: "El nombre es obligatorio" };

  const { data, error } = await supabase
    .from("plan_proyectos")
    .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear el proyecto" };

  revalidatePath("/planificacion");
  return { id: data.id };
}

export interface ProyectoListRow extends ProyectoRow {
  isOwner: boolean;
}

// RLS already restricts plan_proyectos to rows the caller owns or was
// shared into - these two functions just split that same visible set into
// "mine" vs "shared with me" for the two landing-screen sections.
export async function listMisProyectos(): Promise<ProyectoListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_proyectos")
    .select("id, name, description, created_by, archived")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdBy: p.created_by,
    archived: p.archived,
    isOwner: true,
  }));
}

export async function listCompartidoConmigo(): Promise<ProyectoListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_proyectos")
    .select("id, name, description, created_by, archived")
    .neq("created_by", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    createdBy: p.created_by,
    archived: p.archived,
    isOwner: false,
  }));
}

export async function getProyecto(id: string): Promise<ProyectoRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_proyectos")
    .select("id, name, description, created_by, archived")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, description: data.description, createdBy: data.created_by, archived: data.archived };
}

export interface TareaListRow {
  id: string;
  proyectoId: string;
  proyectoName: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  estadoId: string | null;
  estadoName: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  cicloId: string | null;
  createdBy: string;
  moduloIds: string[];
  relationship: "mio" | "asignado" | "compartido";
}

interface RawTareaRow {
  id: string;
  proyecto_id: string;
  plan_proyectos: { name: string } | { name: string }[] | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  estado_id: string | null;
  plan_estados: { name: string } | { name: string }[] | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[] | null;
  start_date: string | null;
  due_date: string | null;
  assignee_id: string | null;
  ciclo_id: string | null;
  created_by: string;
  plan_tarea_modulos: { modulo_id: string }[] | null;
}

function toTareaListRow(t: RawTareaRow, callerId: string): TareaListRow {
  const proyecto = Array.isArray(t.plan_proyectos) ? t.plan_proyectos[0] : t.plan_proyectos;
  const estado = Array.isArray(t.plan_estados) ? t.plan_estados[0] : t.plan_estados;
  const relationship: TareaListRow["relationship"] =
    t.created_by === callerId ? "mio" : t.assignee_id === callerId ? "asignado" : "compartido";
  return {
    id: t.id,
    proyectoId: t.proyecto_id,
    proyectoName: proyecto?.name ?? "",
    parentTaskId: t.parent_task_id,
    title: t.title,
    description: t.description,
    estadoId: t.estado_id,
    estadoName: estado?.name ?? null,
    priority: t.priority,
    labels: t.labels ?? [],
    startDate: t.start_date,
    dueDate: t.due_date,
    assigneeId: t.assignee_id,
    cicloId: t.ciclo_id,
    createdBy: t.created_by,
    moduloIds: (t.plan_tarea_modulos ?? []).map((m) => m.modulo_id),
    relationship,
  };
}

const TAREA_SELECT =
  "id, proyecto_id, plan_proyectos(name), parent_task_id, title, description, estado_id, plan_estados(name), priority, labels, start_date, due_date, assignee_id, ciclo_id, created_by, plan_tarea_modulos(modulo_id)";

// Every task RLS lets the caller see, across every project - the landing
// screen (Task 15) splits this into "Mis tareas" (relationship is "mio" or
// "asignado") and "Compartido conmigo" (relationship is "compartido")
// client-side, the same "fetch everything small, filter client-side"
// pattern used by Suministros' Tablero and Servicios Generales' Workspace.
export async function listTareasVisibles(): Promise<TareaListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_tareas")
    .select(TAREA_SELECT)
    .order("created_at", { ascending: false });

  return (data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id));
}

// One project's full tree - used by the project detail screen (Task 16).
export async function listTareasDeProyecto(proyectoId: string): Promise<TareaListRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("plan_tareas")
    .select(TAREA_SELECT)
    .eq("proyecto_id", proyectoId)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((t) => toTareaListRow(t as unknown as RawTareaRow, user.id));
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit` — expect clean.

- [ ] **Step 3: Commit**

```powershell
git add "src/app/(app)/planificacion/proyectos/actions.ts"
git commit -F "$env:TEMP\claude\commit-msg-plan-shared-actions.txt"
```

---

### Task 6: Task CRUD actions and SharePoint attachments

**Files:**
- Modify: `src/lib/sharepoint.ts` (append a generalized attachment helper)
- Create: `src/app/api/planificacion/adjunto/[driveId]/[itemId]/route.ts`
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts` (append task CRUD + attachment actions)
- Create: `src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx`
- Create: `src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx`

- [ ] **Step 1: Append a generalized attachment upload helper to `src/lib/sharepoint.ts`**

The existing `uploadSharePointPhoto` only allows jpg/png/webp up to 10 MB (fine for a single asset photo). Tasks need multiple attachments per task and a wider set of types (documents, not just images). Append this (do not modify `uploadSharePointPhoto` itself — other callers depend on its exact image-only behavior):

```ts
export const MAX_SHAREPOINT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_SHAREPOINT_ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export interface SharePointAttachmentUploadResult {
  url?: string;
  driveId?: string;
  itemId?: string;
  error?: string;
}

// Generalized sibling of uploadSharePointPhoto for features needing
// multiple files per record and non-image types (Planificación's task
// attachments) - same SharePoint-backed mechanism, wider type/size
// allowance, never a new Supabase Storage bucket.
export async function uploadSharePointAttachment(file: File): Promise<SharePointAttachmentUploadResult> {
  if (file.size > MAX_SHAREPOINT_ATTACHMENT_BYTES) return { error: "El archivo no puede pesar más de 20 MB" };
  if (!ALLOWED_SHAREPOINT_ATTACHMENT_TYPES[file.type]) {
    return { error: "Tipo de archivo no permitido (usa imagen, PDF o Word/Excel)" };
  }
  const bytes = await file.arrayBuffer();
  try {
    const result = await uploadToSharePoint(bytes, file.name, file.type || "application/octet-stream");
    return { url: result.webUrl, driveId: result.driveId, itemId: result.itemId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo subir el archivo" };
  }
}
```

- [ ] **Step 2: Write the attachment viewer route**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ driveId: string; itemId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // No module-permission check here (this feature has none) - RLS on
  // plan_tarea_adjuntos already restricts this select to attachments on a
  // task the caller can see, so a match confirms authorization by itself.
  const { driveId, itemId } = await params;
  const { data: match } = await supabase
    .from("plan_tarea_adjuntos")
    .select("id")
    .eq("drive_id", driveId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!match) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const downloadUrl = await getSharePointDownloadUrl(driveId, itemId);
    return NextResponse.redirect(downloadUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo obtener el archivo" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Append task CRUD + attachment actions to `proyectos/actions.ts`**

```ts
import { uploadSharePointAttachment } from "@/lib/sharepoint";

export interface CreateTareaInput {
  proyectoId: string;
  parentTaskId: string | null;
  title: string;
  description: string;
  estadoId: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  cicloId: string | null;
  moduloIds: string[];
}

export async function createTarea(input: CreateTareaInput): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio" };

  const { data: tarea, error } = await supabase
    .from("plan_tareas")
    .insert({
      proyecto_id: input.proyectoId,
      parent_task_id: input.parentTaskId,
      title: input.title.trim(),
      description: input.description.trim() || null,
      estado_id: input.estadoId,
      priority: input.priority,
      labels: input.labels,
      start_date: input.startDate,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      ciclo_id: input.cicloId,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !tarea) return { error: error?.message ?? "No se pudo crear la tarea" };

  if (input.moduloIds.length > 0) {
    const { error: modError } = await supabase
      .from("plan_tarea_modulos")
      .insert(input.moduloIds.map((modulo_id) => ({ tarea_id: tarea.id, modulo_id })));
    if (modError) return { error: modError.message };
  }

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${input.proyectoId}`);
  return { id: tarea.id };
}

export interface UpdateTareaInput {
  id: string;
  proyectoId: string;
  title: string;
  description: string;
  estadoId: string | null;
  priority: "alta" | "media" | "baja" | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  cicloId: string | null;
  moduloIds: string[];
}

export async function updateTarea(input: UpdateTareaInput): Promise<ActionResult> {
  const supabase = await createClient();
  if (!input.title.trim()) return { error: "El título es obligatorio" };

  const { error } = await supabase
    .from("plan_tareas")
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      estado_id: input.estadoId,
      priority: input.priority,
      labels: input.labels,
      start_date: input.startDate,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      ciclo_id: input.cicloId,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  await supabase.from("plan_tarea_modulos").delete().eq("tarea_id", input.id);
  if (input.moduloIds.length > 0) {
    const { error: modError } = await supabase
      .from("plan_tarea_modulos")
      .insert(input.moduloIds.map((modulo_id) => ({ tarea_id: input.id, modulo_id })));
    if (modError) return { error: modError.message };
  }

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${input.proyectoId}`);
  return {};
}

// Used by the Tablero view's drag-and-drop. proyectoId comes FIRST
// (unlike every other action in this file) so the project detail page can
// pass `updateTareaEstado.bind(null, proyectoId)` down to the client-side
// ProyectosWorkspace as a `(tareaId, estadoId) => Promise<ActionResult>`
// bound Server Action - only a Server Action (not a plain async function)
// can cross the server-to-client prop boundary, and `.bind` only partially
// applies arguments from the front, which is why proyectoId is first here.
export async function updateTareaEstado(proyectoId: string, tareaId: string, estadoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tareas").update({ estado_id: estadoId }).eq("id", tareaId);
  if (error) return { error: error.message };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function updateTareaFecha(tareaId: string, dueDate: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tareas").update({ due_date: dueDate }).eq("id", tareaId);
  if (error) return { error: error.message };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteTarea(tareaId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tareas").delete().eq("id", tareaId);
  if (error) return { error: error.message };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export interface TareaAdjuntoRow {
  id: string;
  fileName: string;
  contentType: string | null;
  driveId: string;
  itemId: string;
}

export async function listAdjuntos(tareaId: string): Promise<TareaAdjuntoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_tarea_adjuntos")
    .select("id, file_name, content_type, drive_id, item_id")
    .eq("tarea_id", tareaId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id,
    fileName: a.file_name,
    contentType: a.content_type,
    driveId: a.drive_id,
    itemId: a.item_id,
  }));
}

export async function addAdjunto(tareaId: string, proyectoId: string, file: File): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (file.size === 0) return { error: "Selecciona un archivo" };

  const uploadResult = await uploadSharePointAttachment(file);
  if (uploadResult.error) return { error: uploadResult.error };

  const { error } = await supabase.from("plan_tarea_adjuntos").insert({
    tarea_id: tareaId,
    file_name: file.name,
    content_type: file.type || null,
    drive_id: uploadResult.driveId,
    item_id: uploadResult.itemId,
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function removeAdjunto(adjuntoId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tarea_adjuntos").delete().eq("id", adjuntoId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

- [ ] **Step 4: Write `TareaCreateDialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTarea, type EstadoOption } from "./actions";

export interface AssigneeOption {
  id: string;
  name: string;
}

export function TareaCreateDialog({
  proyectoId,
  parentTaskId,
  estados,
  assignees,
  triggerLabel,
}: {
  proyectoId: string;
  parentTaskId: string | null;
  estados: EstadoOption[];
  assignees: AssigneeOption[];
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estadoId, setEstadoId] = useState(estados[0]?.id ?? "");
  const [priority, setPriority] = useState<"alta" | "media" | "baja" | "">("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("");
    setStartDate("");
    setDueDate("");
    setAssigneeId("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTarea({
        proyectoId,
        parentTaskId,
        title,
        description,
        estadoId: estadoId || null,
        priority: priority || null,
        labels: [],
        startDate: startDate || null,
        dueDate: dueDate || null,
        assigneeId: assigneeId || null,
        cicloId: null,
        moduloIds: [],
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-3.5" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Estado</label>
              <Select value={estadoId} onValueChange={(v) => v && setEstadoId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => estados.find((e) => e.id === estadoId)?.name ?? "Selecciona"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {estados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Prioridad</label>
              <Select value={priority} onValueChange={(v) => setPriority((v as typeof priority) || "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => priority || "Ninguna"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Fecha de inicio</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Fecha límite</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Responsable</label>
            <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v || "")}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => assignees.find((a) => a.id === assigneeId)?.name ?? "Sin asignar"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !title.trim()} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Note: `EstadoOption` is a small exported type alias needed by this file — append it to `proyectos/actions.ts` in this same task:

```ts
export interface EstadoOption {
  id: string;
  name: string;
  color: string | null;
}

export async function listEstados(proyectoId: string): Promise<EstadoOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_estados")
    .select("id, name, color")
    .eq("proyecto_id", proyectoId)
    .order("sort_order");
  return (data ?? []).map((e) => ({ id: e.id, name: e.name, color: e.color }));
}
```

- [ ] **Step 5: Write `TareaDetailModal.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addAdjunto,
  deleteTarea,
  listAdjuntos,
  removeAdjunto,
  type TareaAdjuntoRow,
  type TareaListRow,
} from "./actions";

export function TareaDetailModal({
  tarea,
  onClose,
}: {
  tarea: TareaListRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [adjuntos, setAdjuntos] = useState<TareaAdjuntoRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tarea) listAdjuntos(tarea.id).then(setAdjuntos);
  }, [tarea]);

  if (!tarea) return null;

  function uploadFile(file: File) {
    if (!tarea) return;
    setError(null);
    startTransition(async () => {
      const result = await addAdjunto(tarea.id, tarea.proyectoId, file);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdjuntos(await listAdjuntos(tarea.id));
      router.refresh();
    });
  }

  function remove(adjuntoId: string) {
    if (!tarea) return;
    startTransition(async () => {
      await removeAdjunto(adjuntoId, tarea.proyectoId);
      setAdjuntos(await listAdjuntos(tarea.id));
      router.refresh();
    });
  }

  function remove_task() {
    if (!tarea) return;
    startTransition(async () => {
      await deleteTarea(tarea.id, tarea.proyectoId);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{tarea.title}</h2>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {tarea.description && <p className="mb-3 text-sm text-muted-foreground">{tarea.description}</p>}
        <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Estado</dt>
            <dd className="font-medium text-foreground">{tarea.estadoName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prioridad</dt>
            <dd className="font-medium text-foreground">{tarea.priority ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fecha límite</dt>
            <dd className="font-medium text-foreground">{tarea.dueDate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Proyecto</dt>
            <dd className="font-medium text-foreground">{tarea.proyectoName}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Paperclip className="size-3.5" />
            Adjuntos
          </p>
          {adjuntos.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
              <a
                href={`/api/planificacion/adjunto/${a.driveId}/${a.itemId}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[#04B1AF] hover:underline"
              >
                {a.fileName}
              </a>
              <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(a.id)}>
                <Trash2 className="size-3.5 text-red-600" />
              </Button>
            </div>
          ))}
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed p-2 text-xs text-muted-foreground hover:bg-muted">
            <Upload className="size-3.5" />
            Subir archivo
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <Button
          variant="outline"
          disabled={isPending}
          onClick={remove_task}
          className="mt-4 w-full gap-1.5 text-red-600"
        >
          <Trash2 className="size-3.5" />
          Eliminar tarea
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint**

Run: `bunx tsc --noEmit` and `bunx eslint "src/lib/sharepoint.ts" "src/app/api/planificacion/adjunto/[driveId]/[itemId]/route.ts" "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx" "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"` — expect clean.

- [ ] **Step 7: Commit**

```powershell
git add "src/lib/sharepoint.ts" "src/app/api/planificacion/adjunto" "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx" "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-tarea-crud.txt"
```

---

### Task 7: Estados CRUD + inline editor

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts` (append)
- Create: `src/app/(app)/planificacion/proyectos/EstadosEditor.tsx`

- [ ] **Step 1: Append to `actions.ts`**

```ts
export async function createEstado(proyectoId: string, name: string, color: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!name.trim()) return { error: "El nombre es obligatorio" };

  const { data: existing } = await supabase
    .from("plan_estados")
    .select("sort_order")
    .eq("proyecto_id", proyectoId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("plan_estados")
    .insert({ proyecto_id: proyectoId, name: name.trim(), color: color || null, sort_order: nextSort });
  if (error) return { error: error.message };

  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteEstado(estadoId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_estados").delete().eq("id", estadoId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

- [ ] **Step 2: Write `EstadosEditor.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEstado, deleteEstado, type EstadoOption } from "./actions";

const ESTADO_COLORS = ["#94a3b8", "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"];

export function EstadosEditor({ proyectoId, estados }: { proyectoId: string; estados: EstadoOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(ESTADO_COLORS[0]);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createEstado(proyectoId, name, color);
      setName("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteEstado(id, proyectoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Estados de este proyecto</p>
      <div className="flex flex-wrap gap-2">
        {estados.map((e) => (
          <span
            key={e.id}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{ borderColor: e.color ?? undefined }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: e.color ?? "#94a3b8" }} />
            {e.name}
            <button type="button" onClick={() => remove(e.id)} disabled={isPending}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Nuevo estado" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <div className="flex gap-1">
          {ESTADO_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`size-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
          <Plus className="size-3.5" />
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/EstadosEditor.tsx"
git add "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/EstadosEditor.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-estados-ui.txt"
```

---

### Task 8: Ciclos CRUD + UI

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts` (append)
- Create: `src/app/(app)/planificacion/proyectos/CiclosManager.tsx`

- [ ] **Step 1: Append to `actions.ts`**

```ts
export interface CicloRow {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export async function listCiclos(proyectoId: string): Promise<CicloRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_ciclos")
    .select("id, name, start_date, end_date")
    .eq("proyecto_id", proyectoId)
    .order("start_date", { ascending: true, nullsFirst: false });
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date }));
}

export async function createCiclo(
  proyectoId: string,
  name: string,
  startDate: string,
  endDate: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!name.trim()) return { error: "El nombre es obligatorio" };
  const { error } = await supabase
    .from("plan_ciclos")
    .insert({ proyecto_id: proyectoId, name: name.trim(), start_date: startDate || null, end_date: endDate || null });
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteCiclo(cicloId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_ciclos").delete().eq("id", cicloId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

- [ ] **Step 2: Write `CiclosManager.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCiclo, deleteCiclo, type CicloRow } from "./actions";

export function CiclosManager({ proyectoId, ciclos }: { proyectoId: string; ciclos: CicloRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createCiclo(proyectoId, name, startDate, endDate);
      setName("");
      setStartDate("");
      setEndDate("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteCiclo(id, proyectoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Ciclos</p>
      {ciclos.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
          <span>
            {c.name} {c.startDate ? `· ${c.startDate} → ${c.endDate ?? "?"}` : ""}
          </span>
          <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(c.id)}>
            <Trash2 className="size-3.5 text-red-600" />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Nombre del ciclo" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-xs" />
      </div>
      <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
        <Plus className="size-3.5" />
        Agregar ciclo
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/CiclosManager.tsx"
git add "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/CiclosManager.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-ciclos-ui.txt"
```

---

### Task 9: Módulos CRUD + UI

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts` (append)
- Create: `src/app/(app)/planificacion/proyectos/ModulosManager.tsx`

- [ ] **Step 1: Append to `actions.ts`**

```ts
export interface ModuloRow {
  id: string;
  name: string;
  description: string | null;
}

export async function listModulos(proyectoId: string): Promise<ModuloRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_modulos")
    .select("id, name, description")
    .eq("proyecto_id", proyectoId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => ({ id: m.id, name: m.name, description: m.description }));
}

export async function createModulo(proyectoId: string, name: string, description: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!name.trim()) return { error: "El nombre es obligatorio" };
  const { error } = await supabase
    .from("plan_modulos")
    .insert({ proyecto_id: proyectoId, name: name.trim(), description: description.trim() || null });
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function deleteModulo(moduloId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_modulos").delete().eq("id", moduloId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

- [ ] **Step 2: Write `ModulosManager.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createModulo, deleteModulo, type ModuloRow } from "./actions";

export function ModulosManager({ proyectoId, modulos }: { proyectoId: string; modulos: ModuloRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createModulo(proyectoId, name, "");
      setName("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteModulo(id, proyectoId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Módulos</p>
      {modulos.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
          <span>{m.name}</span>
          <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => remove(m.id)}>
            <Trash2 className="size-3.5 text-red-600" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="Nombre del módulo" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
        <Button size="sm" disabled={isPending || !name.trim()} onClick={add} className="gap-1.5">
          <Plus className="size-3.5" />
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/ModulosManager.tsx"
git add "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/ModulosManager.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-modulos-ui.txt"
```

---

### Task 10: Sharing actions + "Compartir" dialog

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts` (append)
- Create: `src/app/(app)/planificacion/proyectos/CompartirDialog.tsx`

- [ ] **Step 1: Append to `actions.ts`**

```ts
export interface CompartidoRow {
  id: string;
  appUserId: string;
  userName: string;
  accessLevel: "ver" | "editar";
}

async function buildUserNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data: users } = await supabase.from("app_users").select("id, email").in("id", userIds);
  if (!users || users.length === 0) return new Map();
  const emails = users.map((u) => u.email);
  const { data: contacts } = await supabase.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));
  return new Map(users.map((u) => [u.id, nameByEmail.get(u.email) ?? u.email]));
}

export interface AssignableUser {
  id: string;
  name: string;
}

// Shared by the "Compartir" dialog (picking who to share with) and
// TareaCreateDialog's responsable picker - every active app_user, with a
// real display name resolved the same way as every other module this app
// has built (app_users rarely has a populated name field; resolve via the
// matching contacts row by email instead).
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const supabase = await createClient();
  const { data: users } = await supabase.from("app_users").select("id, email").eq("status", "active").order("email");
  if (!users || users.length === 0) return [];
  const nameByUserId = await buildUserNameMap(users.map((u) => u.id));
  return users.map((u) => ({ id: u.id, name: nameByUserId.get(u.id) ?? u.id }));
}

export async function listProyectoCompartidos(proyectoId: string): Promise<CompartidoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_proyecto_compartidos")
    .select("id, shared_with_app_user_id, access_level")
    .eq("proyecto_id", proyectoId);
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap(rows.map((r) => r.shared_with_app_user_id));
  return rows.map((r) => ({
    id: r.id,
    appUserId: r.shared_with_app_user_id,
    userName: nameByUserId.get(r.shared_with_app_user_id) ?? r.shared_with_app_user_id,
    accessLevel: r.access_level as "ver" | "editar",
  }));
}

export async function shareProyecto(
  proyectoId: string,
  appUserId: string,
  accessLevel: "ver" | "editar",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { error } = await supabase.from("plan_proyecto_compartidos").upsert(
    {
      proyecto_id: proyectoId,
      shared_with_app_user_id: appUserId,
      access_level: accessLevel,
      shared_by: user.id,
    },
    { onConflict: "proyecto_id,shared_with_app_user_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function revokeProyectoShare(shareId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_proyecto_compartidos").delete().eq("id", shareId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function listTareaCompartidos(tareaId: string): Promise<CompartidoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_tarea_compartidos")
    .select("id, shared_with_app_user_id, access_level")
    .eq("tarea_id", tareaId);
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap(rows.map((r) => r.shared_with_app_user_id));
  return rows.map((r) => ({
    id: r.id,
    appUserId: r.shared_with_app_user_id,
    userName: nameByUserId.get(r.shared_with_app_user_id) ?? r.shared_with_app_user_id,
    accessLevel: r.access_level as "ver" | "editar",
  }));
}

export async function shareTarea(
  tareaId: string,
  proyectoId: string,
  appUserId: string,
  accessLevel: "ver" | "editar",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { error } = await supabase.from("plan_tarea_compartidos").upsert(
    { tarea_id: tareaId, shared_with_app_user_id: appUserId, access_level: accessLevel, shared_by: user.id },
    { onConflict: "tarea_id,shared_with_app_user_id" },
  );
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}

export async function revokeTareaShare(shareId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("plan_tarea_compartidos").delete().eq("id", shareId);
  if (error) return { error: error.message };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

- [ ] **Step 2: Write `CompartirDialog.tsx`**

A single reusable dialog for sharing either a proyecto or a tarea — which one is controlled by passing exactly one of `proyectoId`/`tareaId`.

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAssignableUsers,
  listProyectoCompartidos,
  listTareaCompartidos,
  revokeProyectoShare,
  revokeTareaShare,
  shareProyecto,
  shareTarea,
  type AssignableUser,
  type CompartidoRow,
} from "./actions";

interface CompartirDialogProps {
  proyectoId?: string;
  tareaId?: string;
  parentProyectoId: string;
}

export function CompartirDialog({ proyectoId, tareaId, parentProyectoId }: CompartirDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [shares, setShares] = useState<CompartidoRow[]>([]);
  const [userId, setUserId] = useState("");
  const [accessLevel, setAccessLevel] = useState<"ver" | "editar">("ver");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listAssignableUsers().then(setUsers);
    if (proyectoId) listProyectoCompartidos(proyectoId).then(setShares);
    if (tareaId) listTareaCompartidos(tareaId).then(setShares);
  }, [open, proyectoId, tareaId]);

  function add() {
    if (!userId) return;
    setError(null);
    startTransition(async () => {
      const result = proyectoId
        ? await shareProyecto(proyectoId, userId, accessLevel)
        : await shareTarea(tareaId!, parentProyectoId, userId, accessLevel);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShares(proyectoId ? await listProyectoCompartidos(proyectoId) : await listTareaCompartidos(tareaId!));
      router.refresh();
    });
  }

  function revoke(shareId: string) {
    startTransition(async () => {
      if (proyectoId) {
        await revokeProyectoShare(shareId, proyectoId);
        setShares(await listProyectoCompartidos(proyectoId));
      } else {
        await revokeTareaShare(shareId, parentProyectoId);
        setShares(await listTareaCompartidos(tareaId!));
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <Share2 className="size-3.5" />
        Compartir
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Compartir</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {shares.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
              <span>
                {s.userName} · <span className="font-semibold">{s.accessLevel === "editar" ? "Editar" : "Ver"}</span>
              </span>
              <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => revoke(s.id)}>
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Persona</label>
            <Select value={userId} onValueChange={(v) => v && setUserId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => users.find((u) => u.id === userId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Nivel de acceso</label>
            <Select value={accessLevel} onValueChange={(v) => v && setAccessLevel(v as "ver" | "editar")}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => (accessLevel === "editar" ? "Editar" : "Ver")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ver">Ver</SelectItem>
                <SelectItem value="editar">Editar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={isPending || !userId} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Compartir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/CompartirDialog.tsx"
git add "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/CompartirDialog.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-compartir.txt"
```

---

### Task 11: Lista view

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/ListaView.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import Link from "next/link";
import type { TareaListRow } from "./actions";

export function ListaView({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  if (tasks.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin tareas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-3 font-medium">Título</th>
            <th className="p-3 font-medium">Proyecto</th>
            <th className="p-3 font-medium">Estado</th>
            <th className="p-3 font-medium">Prioridad</th>
            <th className="p-3 font-medium">Fecha límite</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="cursor-pointer p-3 font-medium text-foreground" onClick={() => onSelect(t)}>
                {t.title}
              </td>
              <td className="p-3 text-muted-foreground">
                <Link href={`/planificacion/proyectos/${t.proyectoId}`} className="hover:text-[#04B1AF] hover:underline">
                  {t.proyectoName}
                </Link>
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.estadoName ?? "—"}
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.priority ?? "—"}
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.dueDate ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/ListaView.tsx"
git add "src/app/(app)/planificacion/proyectos/ListaView.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-lista-view.txt"
```

---

### Task 12: Tablero (Kanban) view

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/TableroView.tsx`

- [ ] **Step 1: Write the file**

Same native-HTML5-drag-and-drop pattern as `GoservicesBoardView.tsx`, generalized to take arbitrary columns (a project's own custom `plan_estados`, or a read-only deduped set on the landing screen where tasks span multiple projects with unrelated estado catalogs — see Task 15/16 for how each caller supplies `columns`/`getColumnKey`/`onDrop`).

```tsx
"use client";

import { useState } from "react";
import type { TareaListRow } from "./actions";

export interface TableroColumn {
  key: string;
  label: string;
  color: string | null;
}

export function TableroView({
  tasks,
  columns,
  getColumnKey,
  onSelect,
  onDrop,
}: {
  tasks: TareaListRow[];
  columns: TableroColumn[];
  getColumnKey: (t: TareaListRow) => string;
  onSelect: (t: TareaListRow) => void;
  onDrop?: (taskId: string, columnKey: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const byColumn = new Map<string, TareaListRow[]>();
  for (const c of columns) byColumn.set(c.key, []);
  for (const t of tasks) {
    const key = getColumnKey(t);
    if (!byColumn.has(key)) byColumn.set(key, []);
    byColumn.get(key)!.push(t);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const items = byColumn.get(col.key) ?? [];
        const isDragOver = dragOverKey === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              if (!onDrop) return;
              e.preventDefault();
              if (dragOverKey !== col.key) setDragOverKey(col.key);
            }}
            onDragLeave={() => setDragOverKey((prev) => (prev === col.key ? null : prev))}
            onDrop={(e) => {
              if (!onDrop) return;
              e.preventDefault();
              setDragOverKey(null);
              const id = draggingId;
              setDraggingId(null);
              if (id) onDrop(id, col.key);
            }}
            className={`w-64 shrink-0 space-y-2 rounded-xl border border-t-4 bg-card p-3 shadow-sm ${
              isDragOver ? "border-[#04B1AF] bg-[#04B1AF]/5" : ""
            }`}
            style={{ borderTopColor: col.color ?? "#94a3b8" }}
          >
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-semibold text-foreground">{col.label}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  draggable={Boolean(onDrop)}
                  onDragStart={() => setDraggingId(t.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => onSelect(t)}
                  className={`w-full rounded-lg border bg-background p-2.5 text-left text-xs hover:bg-muted ${
                    onDrop ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === t.id ? "opacity-40" : ""}`}
                >
                  <p className="font-semibold text-foreground">{t.title}</p>
                  <p className="truncate text-muted-foreground">{t.proyectoName}</p>
                  {t.dueDate && <p className="mt-1 text-muted-foreground">{t.dueDate}</p>}
                </button>
              ))}
              {items.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Sin tareas</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/TableroView.tsx"
git add "src/app/(app)/planificacion/proyectos/TableroView.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-tablero-view.txt"
```

---

### Task 13: Calendario view

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/CalendarioView.tsx`

- [ ] **Step 1: Write the file**

Same native-HTML5-drag-and-drop calendar pattern as `MaintenanceCalendar.tsx`, keyed off `dueDate` instead of `scheduledDate`.

```tsx
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TareaListRow } from "./actions";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface DayCell {
  day: number;
  dateIso: string;
  tasks: TareaListRow[];
}

function buildMonthGrid(year: number, month: number, tasks: TareaListRow[]): (DayCell | null)[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

  const tasksByDay = new Map<number, TareaListRow[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const day = Number(t.dueDate.slice(8, 10));
    if (!tasksByDay.has(day)) tasksByDay.set(day, []);
    tasksByDay.get(day)!.push(t);
  }

  const cells: (DayCell | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, dateIso, tasks: tasksByDay.get(day) ?? [] });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarioView({
  tasks,
  onSelect,
  onReschedule,
}: {
  tasks: TareaListRow[];
  onSelect: (t: TareaListRow) => void;
  onReschedule: (taskId: string, newDateIso: string) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthTasks = tasks.filter((t) => t.dueDate?.startsWith(monthPrefix));
  const cells = buildMonthGrid(year, month, monthTasks);

  function goPrev() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function goNext() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Calendario</h3>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={goPrev} className="flex size-6 items-center justify-center rounded hover:bg-muted">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[9rem] text-center font-medium text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button type="button" onClick={goNext} className="flex size-6 items-center justify-center rounded hover:bg-muted">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pb-1 text-center font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              if (!cell) return;
              e.preventDefault();
              if (dragOverDate !== cell.dateIso) setDragOverDate(cell.dateIso);
            }}
            onDragLeave={() => setDragOverDate((prev) => (cell && prev === cell.dateIso ? null : prev))}
            onDrop={(e) => {
              if (!cell) return;
              e.preventDefault();
              setDragOverDate(null);
              const id = draggingId;
              setDraggingId(null);
              if (id) onReschedule(id, cell.dateIso);
            }}
            className={`min-h-[72px] rounded-lg border p-1 ${cell ? "bg-background" : "border-transparent"} ${
              cell && dragOverDate === cell.dateIso ? "border-[#04B1AF] bg-[#04B1AF]/5 ring-2 ring-[#04B1AF]/30" : ""
            }`}
          >
            {cell && (
              <>
                <p className="mb-1 text-right text-[11px] text-muted-foreground">{cell.day}</p>
                <div className="space-y-0.5">
                  {cell.tasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDraggingId(t.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => onSelect(t)}
                      className={`w-full truncate rounded px-1 text-left text-[10px] hover:bg-muted ${
                        draggingId === t.id ? "opacity-40" : ""
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {cell.tasks.length > 3 && (
                    <p className="text-[10px] text-muted-foreground">+{cell.tasks.length - 3} más</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/CalendarioView.tsx"
git add "src/app/(app)/planificacion/proyectos/CalendarioView.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-calendario-view.txt"
```

---

### Task 14: Jerarquía (tree) view

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/JerarquiaView.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TareaListRow } from "./actions";

function TreeNode({
  task,
  childrenByParent,
  onSelect,
  depth,
}: {
  task: TareaListRow;
  childrenByParent: Map<string, TareaListRow[]>;
  onSelect: (t: TareaListRow) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = childrenByParent.get(task.id) ?? [];

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        {children.length > 0 ? (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="shrink-0">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="inline-block size-3.5 shrink-0" />
        )}
        <button type="button" onClick={() => onSelect(task)} className="flex-1 truncate text-left">
          {task.title}
        </button>
        {task.estadoName && <span className="shrink-0 text-xs text-muted-foreground">{task.estadoName}</span>}
      </div>
      {expanded &&
        children.map((c) => (
          <TreeNode key={c.id} task={c} childrenByParent={childrenByParent} onSelect={onSelect} depth={depth + 1} />
        ))}
    </div>
  );
}

// A task whose parent_task_id isn't present in the current `tasks` list
// (e.g. someone shared a deep sub-task directly without sharing its
// ancestors) is treated as a root for display purposes here - it still
// renders correctly, just without its real ancestor chain, which the
// viewer was never granted visibility into anyway.
export function JerarquiaView({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  const childrenByParent = new Map<string, TareaListRow[]>();
  const roots: TareaListRow[] = [];
  for (const t of tasks) {
    if (t.parentTaskId && tasks.some((p) => p.id === t.parentTaskId)) {
      if (!childrenByParent.has(t.parentTaskId)) childrenByParent.set(t.parentTaskId, []);
      childrenByParent.get(t.parentTaskId)!.push(t);
    } else {
      roots.push(t);
    }
  }

  if (roots.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin tareas todavía.</p>;
  }

  return (
    <div className="space-y-0.5 rounded-2xl border bg-card p-3 shadow-sm">
      {roots.map((t) => (
        <TreeNode key={t.id} task={t} childrenByParent={childrenByParent} onSelect={onSelect} depth={0} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/JerarquiaView.tsx"
git add "src/app/(app)/planificacion/proyectos/JerarquiaView.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-jerarquia-view.txt"
```

---

### Task 15: Shared workspace component + the `/planificacion` landing screen

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`
- Create: `src/app/(app)/planificacion/page.tsx`
- Create: `src/app/(app)/planificacion/proyectos/NuevoProyectoDialog.tsx`

**Scope note:** creating a new root task directly from the landing screen (across an unspecified project) is out of scope — "Nueva tarea" lives on the project detail page (Task 16), where the target project is unambiguous. The landing screen's own creation entry point is "Nuevo proyecto"; from there the user is taken straight into that project to add tasks. This keeps the landing screen's data model simple (it only ever reads, via `listTareasVisibles`) and avoids a project-picker UI that wasn't requested.

- [ ] **Step 1: Write `ProyectosWorkspace.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, LayoutGrid, List, Network } from "lucide-react";
import { updateTareaFecha, type TareaListRow } from "./actions";
import { ListaView } from "./ListaView";
import { TableroView, type TableroColumn } from "./TableroView";
import { CalendarioView } from "./CalendarioView";
import { JerarquiaView } from "./JerarquiaView";
import { TareaDetailModal } from "./TareaDetailModal";

type ViewMode = "lista" | "tablero" | "calendario" | "jerarquia";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "tablero", label: "Tablero", icon: LayoutGrid },
  { key: "calendario", label: "Calendario", icon: Calendar },
  { key: "jerarquia", label: "Jerarquía", icon: Network },
];

// Reused by both the landing screen (one instance per "Mis tareas"/
// "Compartido conmigo" section, tasks spanning many projects, drag-to-
// change-estado disabled since different projects' estado catalogs don't
// share a common id space) and the project detail screen (one instance,
// tasks scoped to that project, drag-to-change-estado enabled via
// onDropEstado bound to that project's own plan_estados).
export function ProyectosWorkspace({
  tasks,
  columns,
  getColumnKey,
  onDropEstado,
  defaultProyectoId,
}: {
  tasks: TareaListRow[];
  columns: TableroColumn[];
  getColumnKey: (t: TareaListRow) => string;
  onDropEstado?: (tareaId: string, estadoId: string) => Promise<{ error?: string }>;
  defaultProyectoId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<ViewMode>("lista");
  const [selected, setSelected] = useState<TareaListRow | null>(null);

  function reschedule(taskId: string, newDateIso: string) {
    const task = tasks.find((t) => t.id === taskId);
    startTransition(async () => {
      await updateTareaFecha(taskId, newDateIso, task?.proyectoId ?? defaultProyectoId ?? "");
      router.refresh();
    });
  }

  function dropEstado(taskId: string, columnKey: string) {
    if (!onDropEstado) return;
    startTransition(async () => {
      await onDropEstado(taskId, columnKey);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {VIEW_OPTIONS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
              view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <v.icon className="size-3.5" />
            {v.label}
          </button>
        ))}
      </div>

      {view === "lista" && <ListaView tasks={tasks} onSelect={setSelected} />}
      {view === "tablero" && (
        <TableroView
          tasks={tasks}
          columns={columns}
          getColumnKey={getColumnKey}
          onSelect={setSelected}
          onDrop={onDropEstado ? dropEstado : undefined}
        />
      )}
      {view === "calendario" && <CalendarioView tasks={tasks} onSelect={setSelected} onReschedule={reschedule} />}
      {view === "jerarquia" && <JerarquiaView tasks={tasks} onSelect={setSelected} />}

      <TareaDetailModal tarea={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Write `NuevoProyectoDialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createProyecto } from "./actions";

export function NuevoProyectoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createProyecto(name, description);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/planificacion/proyectos/${result.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Nuevo proyecto
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Input placeholder="Nombre del proyecto" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
          />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name.trim()} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `src/app/(app)/planificacion/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTareasVisibles } from "./proyectos/actions";
import { ProyectosWorkspace } from "./proyectos/ProyectosWorkspace";
import { NuevoProyectoDialog } from "./proyectos/NuevoProyectoDialog";

export default async function PlanificacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tasks = await listTareasVisibles();
  const misTareas = tasks.filter((t) => t.relationship === "mio" || t.relationship === "asignado");
  const compartidoConmigo = tasks.filter((t) => t.relationship === "compartido");

  // Mixed-project Tablero columns: different projects have unrelated
  // estado catalogs, so columns here are deduped by estado NAME (not id)
  // rather than one project's real plan_estados - and dragging is
  // disabled (no onDropEstado passed), since there's no single estado_id
  // a dropped card could resolve to across projects. The project detail
  // screen (Task 16) is where the real, per-project, draggable board lives.
  function buildMixedColumns(list: typeof tasks) {
    const names = new Map<string, string>();
    for (const t of list) {
      const key = t.estadoName ?? "sin-estado";
      names.set(key, t.estadoName ?? "Sin estado");
    }
    return Array.from(names.entries()).map(([key, label]) => ({ key, label, color: null }));
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Planificación</h1>
            <p className="text-sm text-muted-foreground">Tus proyectos y tareas.</p>
          </div>
          <NuevoProyectoDialog />
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Mis tareas</h2>
          <ProyectosWorkspace
            tasks={misTareas}
            columns={buildMixedColumns(misTareas)}
            getColumnKey={(t) => t.estadoName ?? "sin-estado"}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Compartido conmigo</h2>
          <ProyectosWorkspace
            tasks={compartidoConmigo}
            columns={buildMixedColumns(compartidoConmigo)}
            getColumnKey={(t) => t.estadoName ?? "sin-estado"}
          />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx" "src/app/(app)/planificacion/proyectos/NuevoProyectoDialog.tsx" "src/app/(app)/planificacion/page.tsx"
git add "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx" "src/app/(app)/planificacion/proyectos/NuevoProyectoDialog.tsx" "src/app/(app)/planificacion/page.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-landing.txt"
```

---

### Task 16: Project detail screen

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/[id]/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProyecto,
  listAssignableUsers,
  listCiclos,
  listEstados,
  listModulos,
  listTareasDeProyecto,
  updateTareaEstado,
} from "../actions";
import { ProyectosWorkspace } from "../ProyectosWorkspace";
import { TareaCreateDialog } from "../TareaCreateDialog";
import { CompartirDialog } from "../CompartirDialog";
import { EstadosEditor } from "../EstadosEditor";
import { CiclosManager } from "../CiclosManager";
import { ModulosManager } from "../ModulosManager";

export default async function ProyectoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const proyecto = await getProyecto(id);
  if (!proyecto) redirect("/planificacion");

  const [tasks, estados, ciclos, modulos, assignees] = await Promise.all([
    listTareasDeProyecto(id),
    listEstados(id),
    listCiclos(id),
    listModulos(id),
    listAssignableUsers(),
  ]);

  const columns = estados.map((e) => ({ key: e.id, label: e.name, color: e.color }));

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{proyecto.name}</h1>
            {proyecto.description && <p className="text-sm text-muted-foreground">{proyecto.description}</p>}
          </div>
          <div className="flex gap-2">
            <CompartirDialog proyectoId={id} parentProyectoId={id} />
            <TareaCreateDialog
              proyectoId={id}
              parentTaskId={null}
              estados={estados}
              assignees={assignees}
              triggerLabel="Nueva tarea"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <EstadosEditor proyectoId={id} estados={estados} />
          <CiclosManager proyectoId={id} ciclos={ciclos} />
          <ModulosManager proyectoId={id} modulos={modulos} />
        </div>

        <ProyectosWorkspace
          tasks={tasks}
          columns={columns}
          getColumnKey={(t) => t.estadoId ?? "sin-estado"}
          onDropEstado={updateTareaEstado.bind(null, id)}
          defaultProyectoId={id}
        />
      </div>
    </div>
  );
}
```

Note on `updateTareaEstado.bind(null, id)`: `updateTareaEstado` is a `"use server"` Server Action exported from `../actions` (Task 6), with signature `(proyectoId, tareaId, estadoId)` — `proyectoId` first specifically so this bind produces a `(tareaId, estadoId) => Promise<ActionResult>` function, matching what `ProyectosWorkspace`'s `onDropEstado` prop expects. Only a Server Action (not a plain async function) can be passed from a Server Component to a Client Component as a prop — a regular wrapper function defined inline in this file would not work.

- [ ] **Step 2: Typecheck, lint, commit**

```powershell
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/[id]/page.tsx"
git add "src/app/(app)/planificacion/proyectos/[id]/page.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-proyecto-detail.txt"
```

---

### Task 17: Sidebar and layout rewiring

**Files:**
- Modify: `src/app/(app)/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Remove the Planificación permission props from `layout.tsx`**

Delete these lines (the exact block currently passed into `<AppShell>`):

```tsx
      canViewPlanificacion={Boolean(
        permissions.get("planificacion")?.can_view
          || permissions.get("planificacion")?.can_manage
          || permissions.get("planificacion")?.can_authorize,
      )}
      canManagePlanificacion={Boolean(permissions.get("planificacion")?.can_manage)}
      canAuthorizePlanificacion={Boolean(permissions.get("planificacion")?.can_authorize)}
```

This feature has no module-permission gate at all, so `layout.tsx` has nothing to compute or pass for it.

- [ ] **Step 2: Remove the three props from `Sidebar.tsx`'s destructured parameter list and its TypeScript type**

Delete, from the destructured parameter list:

```tsx
  canViewPlanificacion,
  canManagePlanificacion,
  canAuthorizePlanificacion,
```

And delete, from the type block:

```tsx
  canViewPlanificacion: boolean;
  canManagePlanificacion: boolean;
  canAuthorizePlanificacion: boolean;
```

- [ ] **Step 3: Replace the `planificacionLinks`/`FlyoutNavGroup` block with a single always-visible link**

The new feature needs no permission gate and has only one real entry point (`/planificacion` — the project detail route is reached by navigating from there, not from the sidebar directly), so a `FlyoutNavGroup` is no longer the right shape; a single flat link fits the existing `mainLinksBeforeMaintenance`/`mainLinksAfterMaintenance` pattern (plain, always-visible nav items) used elsewhere in this file.

Delete this entire block:

```tsx
  // "Mi POA" is visible to anyone granted can_view/can_manage/can_authorize
  // on 'planificacion' - gated the same way every other module in this app
  // is (never open by default). "Mi equipo" needs can_manage or
  // can_authorize; "Puestos" and "Líderes" are Consejo-only (can_authorize).
  const planificacionLinks: NavLink[] = [
    ...(canViewPlanificacion ? [{ href: "/planificacion/poas", label: "Mi POA", icon: Target }] : []),
    ...(canManagePlanificacion || canAuthorizePlanificacion
      ? [{ href: "/planificacion/equipo", label: "Mi equipo", icon: Users }]
      : []),
    ...(canAuthorizePlanificacion
      ? [
          { href: "/planificacion/puestos", label: "Puestos y KPIs", icon: ShieldCheck },
          { href: "/planificacion/lideres", label: "Líderes por departamento", icon: Network },
        ]
      : []),
  ];
```

And this render block:

```tsx
          {planificacionLinks.length > 0 && (
            <div className="space-y-1 pt-4">
              {!collapsed && (
                <p className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                  <Target className="size-3.5" />
                  Planificación
                </p>
              )}
              <FlyoutNavGroup
                label="Planificación"
                icon={Target}
                links={planificacionLinks}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </div>
          )}
```

In their place, add a plain entry to `mainLinksAfterMaintenance` (no permission check at all — any logged-in user sees it, per this feature having no role gate):

```tsx
  const mainLinksAfterMaintenance: NavLink[] = [
    { href: "/planificacion", label: "Planificación", icon: Target },
    ...(canManageUsers ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];
```

(This replaces the existing `mainLinksAfterMaintenance` definition — add the new unconditional entry as the first item, keep the existing `canManageUsers` entry exactly as it was.)

- [ ] **Step 4: Typecheck, lint**

Run: `bunx tsc --noEmit` and `bunx eslint "src/app/(app)/Sidebar.tsx" "src/app/(app)/layout.tsx"`. Expect clean (the pre-existing `no-html-link-for-pages` warning on the `/` logo link, if still present, predates this task and is out of scope).

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(app)/Sidebar.tsx" "src/app/(app)/layout.tsx"
git commit -F "$env:TEMP\claude\commit-msg-plan-sidebar.txt"
```

---

### Task 18: Final verification, manual smoke test, and deploy handoff

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `bunx tsc --noEmit` — expect zero errors anywhere in the repo.

- [ ] **Step 2: Full lint of every new/modified file**

```powershell
bunx eslint "src/lib/sharepoint.ts" "src/app/api/planificacion/adjunto/[driveId]/[itemId]/route.ts" "src/app/(app)/planificacion/page.tsx" "src/app/(app)/planificacion/proyectos/actions.ts" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx" "src/app/(app)/planificacion/proyectos/NuevoProyectoDialog.tsx" "src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx" "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx" "src/app/(app)/planificacion/proyectos/EstadosEditor.tsx" "src/app/(app)/planificacion/proyectos/CiclosManager.tsx" "src/app/(app)/planificacion/proyectos/ModulosManager.tsx" "src/app/(app)/planificacion/proyectos/CompartirDialog.tsx" "src/app/(app)/planificacion/proyectos/ListaView.tsx" "src/app/(app)/planificacion/proyectos/TableroView.tsx" "src/app/(app)/planificacion/proyectos/CalendarioView.tsx" "src/app/(app)/planificacion/proyectos/JerarquiaView.tsx" "src/app/(app)/planificacion/proyectos/[id]/page.tsx" "src/app/(app)/Sidebar.tsx" "src/app/(app)/layout.tsx"
```

Expect clean (same one pre-existing, out-of-scope Sidebar.tsx warning as every other recent delivery).

- [ ] **Step 3: Production build**

Run: `bun run build`. Expect success, with the route list including `/planificacion` and `/planificacion/proyectos/[id]`.

- [ ] **Step 4: Manual smoke test**

With any logged-in account (no permission grant needed for this feature):
1. Visit `/planificacion`. Click "Nuevo proyecto", create one — you land on its detail page.
2. Add a couple of Estados in the Estados editor (e.g. "Por hacer", "En progreso", "Listo").
3. Click "Nueva tarea", create a root task. Open it (click its title), confirm the detail modal shows its fields.
4. From the Jerarquía view, there's no "add sub-task" button yet in this delivery's UI — note this as a known v1 gap (see Self-Review below) and instead create a second root task to exercise the rest of the flow, OR verify via direct testing that the `createTarea` action accepts a `parentTaskId` correctly (this is covered by the data model even if the UI entry point for it is minimal in Task 15's `TareaCreateDialog`, which only exposes creating a root task from the project header in this delivery).
5. Switch between Lista, Tablero, Calendario, Jerarquía — confirm the same tasks appear in all four.
6. Drag a task card between two Tablero columns — confirm its estado changes and persists after a refresh.
7. Set a due date on a task, switch to Calendario, drag it to a different day — confirm the date updates.
8. Click "Compartir" on the project, share it with a second test account at "Ver" level. Log in as that account, confirm it appears under "Compartido conmigo" on `/planificacion`, and that the detail page's Compartir dialog and Estados/Ciclos/Módulos editors are not usable for that account (ver-only).
9. Upload an attachment to a task from its detail modal; confirm it appears and downloads correctly via the SharePoint-backed link.
10. Confirm the old POA routes (`/planificacion/poas`, etc.) still load exactly as before — they are untouched, just no longer linked from the Sidebar.

- [ ] **Step 5: Commit and deploy handoff**

If any fixups were needed during Steps 1-4, write a commit message to a temp file and commit with `git commit -F`, same pattern as every other commit in this plan.

Then — **do not run `bunx vercel --prod` automatically.** Ask the user explicitly: "¿Despliego Proyectos a producción?" and wait for a clear yes before deploying, per this session's standing rule. After deploying, verify with `bunx vercel inspect <url>`.

---

## Self-Review Notes

**Spec coverage:** every section of `docs/superpowers/specs/2026-10-26-planificacion-proyectos-design.md` maps to a task — `plan_proyectos`/sharing (Task 1), `plan_estados` (Task 2), `plan_ciclos`/`plan_modulos` (Task 3), `plan_tareas` + ancestor trigger + cascading RLS (Task 4), the no-role-gate access model (reflected in every page/action throughout — explicitly called out in Tasks 15-17), unlimited nesting with delegable sharing (Task 4's RLS + Task 10's sharing UI), per-project custom estados (Task 2 + 7), Ciclos/Módulos (Tasks 3, 8, 9), SharePoint attachments (Task 6), the four views (Tasks 11-14), the two landing sections (Task 15), the project detail screen (Task 16), POA left in place but unlinked (Task 17).

**Drift check on `ancestor_ids` (self-review concern (a) from this plan's own brief):** the array is computed in exactly one place — the `plan_set_tarea_ancestor_ids` trigger in Task 4. No app-code action in Task 6 (`createTarea`) ever sets or computes `ancestor_ids` itself; it only sets `parent_task_id` and lets the trigger derive the array. There is no second, app-code copy of this logic anywhere in the plan to drift out of sync with the trigger.

**Ownership/assignment-implies-editar check (self-review concern (b)):** both `plan_can_see_tarea` and `plan_can_edit_tarea` (Task 4) check `t.created_by = auth.uid()` and `t.assignee_id = auth.uid()` as direct, unconditional alternatives alongside the share-based checks — never gated behind a share row's `access_level`. The same structure is mirrored in `plan_can_see_proyecto`/`plan_can_edit_proyecto` (Task 1) for project-level ownership. App-code never re-implements this check separately (every action and page relies on RLS itself, via the plain session client), so there is only one place this rule could be wrong, and it correctly reflects the spec in both functions.

**Shared-shape check (self-review concern (c)):** `ListaView`, `TableroView`, `CalendarioView`, and `JerarquiaView` (Tasks 11-14) all take `tasks: TareaListRow[]` — the one shape defined in Task 5 and extended in Task 6, never redefined. `ProyectosWorkspace` (Task 15) is the single place that fetches/receives this list and switches between the four views, so all four always render the exact same underlying data.

**Known v1 gaps, stated plainly:** creating a root task is only exposed from the project detail page's header, not from the landing screen (documented in Task 15's scope note) or from inside the Jerarquía view as an inline "add sub-task" button next to each node (the `createTarea` action and RLS fully support `parentTaskId`, but Task 15/16 don't wire a dedicated "add child here" UI control — a reasonable follow-up, not a blocker for this delivery, noted again in Task 18's smoke test). Labels (the `labels text[]` column) exist in the schema but have no editing UI in this delivery — also a stated, deliberate v1 gap rather than an oversight.

