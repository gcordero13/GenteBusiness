# Planificación — Progress %, Protected Default Estados, Task Color (Design)

## Context

This is a follow-up delivery on top of the "Proyectos" system shipped in `2026-10-26-planificacion-proyectos-design.md`. After live testing, the user asked for three changes plus two clarifications:

1. Tasks should track a 0–100% progress value. Reaching 100% should move the task to the "Completado" estado automatically.
2. A task with sub-tasks should have its progress computed automatically from its sub-tasks, split evenly among them (e.g. "Limpieza de oficina" split into 3 sub-tasks — each sub-task is worth 1/3 of the parent's progress).
3. The 4 base estados (En espera, En proceso, Completado, Cancelado — Cancelado is new) should always exist on every project and never be deletable; adding further custom estados should still be possible but tucked behind a secondary action instead of sitting open in the editor.
4. Each task should be able to carry its own color tag, independent of its estado.
5. Users need a way back from a project's detail page to the Proyectos list without going through the sidebar/menu.

Ciclos and Módulos were explained to the user during brainstorming; the user decided both are hidden from the UI for now (schema and code stay, nothing is dropped, consistent with this app's "retire, don't delete" precedent already used for the old POA screens).

## 1. Protected default estados

`plan_estados` gains two columns:

```sql
alter table public.plan_estados
  add column kind text check (kind in ('en_espera', 'en_proceso', 'completado', 'cancelado')),
  add column is_default boolean not null default false;

create unique index plan_estados_kind_unique_per_proyecto
  on public.plan_estados (proyecto_id, kind)
  where kind is not null;
```

`kind` is how the system finds "the Completado estado of this project" regardless of what the user renames it to. `is_default` marks the 4 seeded rows as non-deletable; a project may still have any number of additional `kind = null` custom estados, which remain fully editable/deletable as today.

**Backfill for the 2 existing projects:** a migration sets `kind`/`is_default` on their 3 existing estados by matching on current name (`'En espera'` → `en_espera`, `'En proceso'` → `en_proceso`, `'Completado'` → `completado`), then inserts a `Cancelado` row (`color = '#ef4444'`, `kind = 'cancelado'`, `is_default = true`, `sort_order` = current max + 1) for every project that doesn't already have a `cancelado` estado.

**`createProyecto`** seeds all 4 rows up front, each with its `kind` set:

| name | color | kind |
|---|---|---|
| En espera | #94a3b8 | en_espera |
| En proceso | #3b82f6 | en_proceso |
| Completado | #10b981 | completado |
| Cancelado | #ef4444 | cancelado |

**Deletion is blocked at two layers** (matching this feature's existing defense-in-depth style): `deleteEstado` returns an error when `is_default = true` without ever issuing the delete, and the `plan_estados` delete RLS policy adds `and is_default = false` to its `USING` clause so a default estado can't be removed even by direct API misuse.

**`EstadosEditor.tsx`** changes: default-estado chips lose their delete (✕) button entirely (not just disabled — there's nothing useful to click). The "add a new estado" form (name input + color swatches + Agregar button) moves behind a collapsed "+ Agregar estado personalizado" toggle instead of always being open.

## 2. Progress percentage

`plan_tareas` gains:

```sql
alter table public.plan_tareas
  add column percent_complete integer not null default 0
    check (percent_complete between 0 and 100);
```

### Leaf tasks (no sub-tasks)

Percent is user-editable (0–100, shown as a slider + number in `TareaDetailModal`). Rules:

- **Assigning** a task (setting `assignee_id` from null to a value) while `percent_complete = 0` bumps it to 5. This only fires on the null → value transition, so re-assigning an already-in-progress task never overwrites real progress. Applies both at creation (`createTarea`, when an assignee is chosen up front) and in `updateTarea`.
- **Reaching 100%** (via the detail view's slider, or via drag-and-drop onto a column whose estado has `kind = 'completado'`) sets `estado_id` to that project's `completado` estado.
- **Moving the estado away from `completado`** (drag-and-drop, or picking a different estado manually) while `percent_complete = 100` forces it down to 99 — so a task can never sit at 100% while not actually marked Completado.
- **Setting the estado directly to `completado`** (without going through 100%) forces `percent_complete` to 100, keeping the two fields in sync both directions.

### Parent tasks (one or more direct sub-tasks)

Percent is **computed, not user-editable**: `round(average(direct children's percent_complete))`. The detail view shows it read-only with a short note ("Calculado a partir de las subtareas"). The 5%-on-assignment rule does not apply to a parent task.

The same "100% ⇒ estado Completado" transition applies to parents too — when a recompute brings a parent to 100%, its estado is set to that project's `completado` estado, exactly like a leaf reaching 100% manually. The "force away from 100% when estado changes manually" rule does **not** apply to parents, since their percent isn't user-settable — a parent can be left at a stale 100% while manually marked `Cancelado`, which is an acceptable, honest reflection of "the sub-work finished, but we're cancelling it anyway."

A task becomes a "parent" simply by having any row with `parent_task_id` pointing at it — there's no separate flag. Deleting its last sub-task turns it back into a leaf (percent becomes editable again, keeping whatever value it last computed to).

### Recompute mechanism

Implemented as a Postgres trigger (`plan_recompute_ancestor_percent`), `AFTER INSERT OR UPDATE OF percent_complete, parent_task_id OR DELETE ON plan_tareas`, mirroring this feature's existing `plan_set_tarea_ancestor_ids` trigger pattern (defense-in-depth: correctness is guaranteed regardless of which app code path wrote the row). On any such change, the trigger walks up the `parent_task_id` chain: for each ancestor, it recomputes `percent_complete = round(avg(direct children's percent_complete))` (only when that ancestor has at least one child) and, when that recompute reaches 100, also sets that ancestor's `estado_id` to its project's `completado` estado — then continues to that ancestor's own parent, and so on to the root. A single leaf edit can therefore ripple all the way up a deep branch in one statement.

## 3. Task color

`plan_tareas` gains:

```sql
alter table public.plan_tareas add column color text;
```

Nullable, free-standing from `estado_id` — a user-chosen tag color shown as a small dot/left-border on the task in every view (Tablero card, Lista row, Jerarquía node). Picked from the same swatch palette already used for estados (`ESTADO_COLORS` in `EstadosEditor.tsx`, reused rather than duplicated) in both `TareaCreateDialog` and `TareaDetailModal`. No default color (`null` renders as no dot, i.e. today's look).

## 4. Back navigation on project detail

`proyectos/[id]/page.tsx` gets a small "← Volver a Planificación" link at the top, pointing at `/planificacion`, next to the project name — a plain in-page link, not a menu/sidebar change.

## 5. Hiding Ciclos and Módulos

`CiclosManager` and `ModulosManager` are removed from `proyectos/[id]/page.tsx`'s render tree; the Ciclo `<Select>` and the Módulos checkbox list are removed from `TareaCreateDialog.tsx` and `TareaDetailModal.tsx`. The components, their actions, and the `plan_ciclos`/`plan_modulos`/`plan_tarea_modulos` tables are left completely in place and unreferenced, matching this codebase's established "leave orphaned low-risk artifacts in place" precedent (already used for the retired POA screens). No migration needed — this is a UI-only change.

## Out of scope

- Automatic rollup weighted by anything other than an equal split per direct child (e.g. weighting by estimated effort) — not requested.
- A free-form color picker beyond the existing swatch palette — not requested, the user asked for "más colores" on tasks specifically (a per-task tag), not a wider palette.
- Any change to sharing, attachments, or the four main views beyond showing the new percent/color on cards — out of scope for this delivery.
