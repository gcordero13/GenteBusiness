# Planificación — Proyectos (Design)

## Context

The "Planificación" module currently has a POAs tab (Plan Operativo Anual — annual KPI/goal tracking per person/puesto), built and deployed to production two days before this spec. The user has since asked for Planificación to be rebuilt around the structure of [makeplane/plane](https://github.com/makeplane/plane), an open-source Linear/Jira-style project management tool — but with its own concrete requirements that diverge from Plane in some places (unlimited task nesting, delegated per-branch sharing instead of project membership, no company-wide "see everything" role).

**Decision: the whole Planificación module is replaced.** The POA concept is retired entirely — no special "POA" entity, no role-based department-leader supervision, no puesto/KPI-template catalog. Everything becomes a single generic system: **Proyectos** containing a tree of **Tareas**, with access controlled by ownership and explicit sharing rather than by role profile. The four screens live today (`/planificacion/poas`, `/planificacion/equipo`, `/planificacion/puestos`, `/planificacion/lideres`) are retired once this ships; their tables and the `planificacion_department_leaders` junction table are left in place (harmless, unused) rather than dropped, matching this codebase's established "leave orphaned low-risk artifacts, don't force a risky migration" precedent.

This spec covers one delivery: Proyectos, Tareas (with unlimited nesting), sharing, custom per-project states, Ciclos, Módulos, attachments, and four views (Lista/Tablero/Calendario/Jerarquía). Notifications and "following" a task are explicitly out of scope, deferred to a later delivery.

## Key decisions from brainstorming

- **Scope: the whole module's structure changes**, not just a "Tareas tab" bolted onto the existing POA structure.
- **A "proyecto" is a named root container**, created by any user. Cualquier usuario autenticado puede crear un proyecto — no requiere permiso de rol.
- **Tareas anidadas sin límite de profundidad**: a task can have sub-tasks, which can have their own sub-tasks, and so on (an "organigrama de tareas"). Assigning a task to someone lets that person create further sub-tasks beneath it.
- **Compartir es por rama, en cascada hacia abajo**: sharing a task (or a whole project, which is equivalent to sharing its root) grants the recipient access to that node and everything beneath it, with a "ver" or "editar" level. Whoever owns/was granted access to a branch can re-share that branch (and what they create under it) with anyone else, without needing permission from the project's original creator.
- **No role-based override.** Not even Consejo gets a "see everything in the company" view. Visibility is strictly: owner, assignee, or explicit share (direct or inherited from an ancestor). This is a deliberate, explicit exception to this app's otherwise-universal "nothing visible without an explicit role-profile grant" policy — confirmed directly with the user.
- **Default landing is split into two buckets**: "Mis tareas" (projects/tasks the user owns or is assigned) and "Compartido conmigo" (access granted by someone else) — not a single combined list.
- **Per-project custom states** (not fixed company-wide states) — each project defines its own status columns, closer to real Plane than to this codebase's other Kanban boards (GoServices/Servicios Generales use fixed, company-wide statuses).
- **Ciclos (sprints) and Módulos are in scope for this same delivery** (the user explicitly chose "both, in one design" over a phased rollout when offered the option). A task belongs to at most one ciclo, and to zero or more módulos — matching real Plane's relationship model.
- **Interactive, multi-view, drag-and-drop**: Lista, Tablero (Kanban, drag between states), Calendario (drag to reschedule by due date), and a Jerarquía/tree view showing the nesting. Reuses this codebase's existing native-HTML5-drag-and-drop board pattern (no new DnD library) and the existing "fetch everything small, switch views client-side" pattern.
- **Attachments (photos and documents)** reuse the existing SharePoint-backed storage mechanism (`src/lib/sharepoint.ts`) — per this session's standing architectural rule, no new Supabase Storage bucket for any photo/file feature.
- **Notifications and "following" a task are explicitly deferred** to a later delivery — not built now.

## Permissions and visibility model

This is a deliberate departure from every other module in this codebase. There is no `role_profile_permissions` gate on this feature at all — any authenticated `app_user` can open `/planificacion`, create projects, and create/manage tasks they own. Visibility of a specific project or task is governed entirely by:

1. **Ownership** — the `created_by` of the project or task.
2. **Assignment** — the task's `assignee_id`.
3. **Explicit sharing** — a row in `proyecto_compartidos` (shares the whole project, i.e. its root) or `tarea_compartidos` (shares one task and everything beneath it) naming the caller, with `access_level` of `ver` or `editar`.

Sharing cascades downward only (sharing a node grants access to its entire subtree) and is **delegable**: whoever can see a branch (owner, assignee, or someone it was shared with) can share that same branch further with anyone else, independent of the project's original creator. There is no centralized "only the root owner can grant access" rule, and no role (including Consejo) bypasses this to see everything company-wide.

Ownership and assignment always imply full (`editar`) access, regardless of any inherited share level above — e.g., if a project is shared with someone at `ver` only, but they are the `assignee` on one task inside it (or they create their own sub-task under a branch they can see), they can still edit that specific task and its descendants. A `ver`-level share only restricts someone who has no ownership/assignment claim of their own on that node.

### Technical approach: materialized ancestor array

Each `tareas` row stores `ancestor_ids uuid[]` — the list of every task above it in the tree, maintained by a trigger on insert (computed as `parent.ancestor_ids || parent.id`, or `{}` for a root task). A task is visible to the caller if:

```
caller owns the project
or caller owns the task
or caller is the task's assignee
or exists a proyecto_compartidos row for this project naming the caller
or exists a tarea_compartidos row for (this task's id, or any id in its ancestor_ids) naming the caller
```

This avoids a recursive query per visibility check — a GIN-indexed array containment check (`tarea_compartidos.task_id = ANY(ancestor_ids || id)`) is sufficient and stays fast as the tree grows. This is the "Opción A" approach chosen over (B) recomputing the tree per-query (simpler schema, but slower as data grows) or (C) capping nesting at two levels (simpler, but doesn't support the unlimited-depth delegation the user asked for).

## Data model

```sql
create table public.plan_proyectos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references public.app_users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.plan_proyecto_compartidos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  shared_with_app_user_id uuid not null references public.app_users(id) on delete cascade,
  access_level text not null check (access_level in ('ver', 'editar')),
  shared_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (proyecto_id, shared_with_app_user_id)
);

create table public.plan_estados (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.plan_proyectos(id) on delete cascade,
  name text not null,
  color text,
  sort_order integer not null default 0
);

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
create index on public.plan_tareas using gin (ancestor_ids);

create table public.plan_tarea_modulos (
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  modulo_id uuid not null references public.plan_modulos(id) on delete cascade,
  primary key (tarea_id, modulo_id)
);

create table public.plan_tarea_compartidos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.plan_tareas(id) on delete cascade,
  shared_with_app_user_id uuid not null references public.app_users(id) on delete cascade,
  access_level text not null check (access_level in ('ver', 'editar')),
  shared_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (tarea_id, shared_with_app_user_id)
);

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
```

RLS on every table follows the visibility rule above (select/update/delete gated by ownership/assignment/share-with-cascade; insert of a `plan_tareas` row requires the caller to already have `editar`-level-or-owner access to its `parent_task_id`, or be the project's owner/an `editar` project-share holder when creating a root task).

## Screens

- **`/planificacion`** — landing screen with two sections, **Mis tareas** and **Compartido conmigo**, each switchable between the four views (Lista, Tablero, Calendario, Jerarquía) — same "one screen, multiple interchangeable views" pattern as Suministros' Tablero and Servicios Generales' Workspace.
- **`/planificacion/proyectos/[id]`** — one project's full task tree, same four views, a "Compartir" control (grant/revoke ver/editar access to the whole project), and management of that project's Ciclos and Módulos.
- Creating a task while viewing another task creates it as that task's child (a new branch).
- Attachments upload through the existing SharePoint mechanism; `plan_tarea_adjuntos` supports multiple files per task (unlike the single `photo_drive_id`/`photo_item_id` columns used for Servicios Generales' one-photo-per-asset case).
- The Sidebar's existing "Planificación" flyout group is rebuilt to point at the new screens, replacing the four POA links.

## Out of scope for this delivery

- Email notifications and "seguir" (follow) a task — a later delivery.
- Bulk edit / moving a task between projects.
- CSV export (can be added later following the existing pattern used by every other module, if needed).
- Any revival or migration of POA data — POA is retired, not ported forward.
