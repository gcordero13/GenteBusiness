# Planificación — Progress %, Protected Estados, Task Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task progress percentage (manual on leaf tasks, auto-computed from sub-tasks on parent tasks), protect the 4 base estados from deletion, add a per-task color tag, hide Ciclos/Módulos from the UI, and add a "back to Planificación" link — on top of the already-shipped Proyectos system.

**Architecture:** Two new columns on `plan_estados` (`kind`, `is_default`) let the app find "the Completado estado" regardless of its display name, and protect the 4 seeded rows from deletion via RLS. Two new columns on `plan_tareas` (`percent_complete`, `color`). A new Postgres trigger keeps a parent task's `percent_complete` in sync with the average of its direct children, cascading upward, with a `pg_trigger_depth()` guard so it runs its own internal while-loop exactly once per external write instead of re-triggering itself. App-code in `actions.ts` owns the leaf-task sync rules (5% on first assignment, 100%⇄estado-Completado, forcing back to 99% when manually moved off Completado) since those only apply to tasks without children.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Bun. No new libraries.

---

### Task 1: `plan_estados` — `kind`/`is_default`, backfill, protect from deletion

**Files:**
- Create: `supabase/migrations/20261027130000_plan_estados_kind.sql`
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts:486-530` (`EstadoOption`, `listEstados`, `deleteEstado`, `createProyecto`'s seeding)

- [ ] **Step 1: Write the migration**

```sql
-- plan_estados gains `kind` (lets the app find "the Completado estado of
-- this project" regardless of what the user renames it to) and `is_default`
-- (marks the 4 seeded rows so they can never be deleted). Confirmed with
-- the user: En espera/En proceso/Completado/Cancelado must always exist on
-- every project; further custom estados stay fully editable/deletable.
alter table public.plan_estados
  add column kind text check (kind in ('en_espera', 'en_proceso', 'completado', 'cancelado')),
  add column is_default boolean not null default false;

create unique index plan_estados_kind_unique_per_proyecto
  on public.plan_estados (proyecto_id, kind)
  where kind is not null;

-- Backfill: the 2 projects that already exist only got the old 3-estado
-- default (no Cancelado). Match by current name to assign kind/is_default
-- to those 3, then insert the missing Cancelado for every project.
update public.plan_estados set kind = 'en_espera', is_default = true where name = 'En espera' and kind is null;
update public.plan_estados set kind = 'en_proceso', is_default = true where name = 'En proceso' and kind is null;
update public.plan_estados set kind = 'completado', is_default = true where name = 'Completado' and kind is null;

insert into public.plan_estados (proyecto_id, name, color, kind, is_default, sort_order)
select p.id, 'Cancelado', '#ef4444', 'cancelado', true,
  coalesce((select max(e.sort_order) + 1 from public.plan_estados e where e.proyecto_id = p.id), 0)
from public.plan_proyectos p
where not exists (
  select 1 from public.plan_estados e where e.proyecto_id = p.id and e.kind = 'cancelado'
);

-- Deletion of a default estado is blocked at the RLS layer, not just the
-- UI. plan_estados_write ("for all") can't express "insert/update allowed,
-- delete only when not default" in one policy (its USING clause would also
-- gate UPDATE), so it's split into three.
drop policy "plan_estados_write" on public.plan_estados;

create policy "plan_estados_insert" on public.plan_estados
  for insert
  with check (public.plan_can_edit_proyecto(proyecto_id));

create policy "plan_estados_update" on public.plan_estados
  for update
  using (public.plan_can_edit_proyecto(proyecto_id))
  with check (public.plan_can_edit_proyecto(proyecto_id));

create policy "plan_estados_delete" on public.plan_estados
  for delete
  using (public.plan_can_edit_proyecto(proyecto_id) and is_default = false);
```

- [ ] **Step 2: STOP — hand this to the user**

Tell the user (in Spanish): paste the SQL above into the Supabase SQL Editor and run it. Do not continue to Step 3 until they confirm it ran successfully.

- [ ] **Step 3: Update `EstadoOption`, `listEstados`, `deleteEstado`, `createProyecto` in `actions.ts`**

Replace lines 486-500:

```typescript
export interface EstadoOption {
  id: string;
  name: string;
  color: string | null;
  kind: "en_espera" | "en_proceso" | "completado" | "cancelado" | null;
  isDefault: boolean;
}

export async function listEstados(proyectoId: string): Promise<EstadoOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_estados")
    .select("id, name, color, kind, is_default")
    .eq("proyecto_id", proyectoId)
    .order("sort_order");
  return (data ?? []).map((e) => ({ id: e.id, name: e.name, color: e.color, kind: e.kind, isDefault: e.is_default }));
}
```

Replace `deleteEstado` (lines 523-530):

```typescript
export async function deleteEstado(estadoId: string, proyectoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: estado } = await supabase.from("plan_estados").select("is_default").eq("id", estadoId).maybeSingle();
  if (estado?.is_default) return { error: "No se puede eliminar un estado base" };

  const { data, error } = await supabase.from("plan_estados").delete().eq("id", estadoId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

Replace the estado-seeding block inside `createProyecto` (lines 45-56):

```typescript
  // Every new project starts with these four estados already in place -
  // confirmed with the user. The 3 original ones plus "Cancelado" (added
  // after the user asked for it), all marked is_default so they can never
  // be deleted; kind lets the app find "the Completado estado" by meaning,
  // not by display name, even if the user renames it. Not self-referential
  // (plan_estados_select checks plan_can_see_proyecto, which queries
  // plan_proyectos - a different, already-committed row), so no chained
  // .select() issue here.
  const { error: estadosError } = await supabase.from("plan_estados").insert([
    { proyecto_id: newId, name: "En espera", color: "#94a3b8", sort_order: 0, kind: "en_espera", is_default: true },
    { proyecto_id: newId, name: "En proceso", color: "#3b82f6", sort_order: 1, kind: "en_proceso", is_default: true },
    { proyecto_id: newId, name: "Completado", color: "#10b981", sort_order: 2, kind: "completado", is_default: true },
    { proyecto_id: newId, name: "Cancelado", color: "#ef4444", sort_order: 3, kind: "cancelado", is_default: true },
  ]);
  if (estadosError) return { error: estadosError.message };
```

- [ ] **Step 4: Verify**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261027130000_plan_estados_kind.sql "src/app/(app)/planificacion/proyectos/actions.ts"
git commit -m "$(cat <<'EOF'
feat(planificacion): protect base estados from deletion, add Cancelado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `plan_tareas` — `percent_complete`/`color` columns + grant extension

**Files:**
- Create: `supabase/migrations/20261027140000_plan_tareas_percent_color.sql`

- [ ] **Step 1: Write the migration**

```sql
-- percent_complete: 0-100 progress. color: an optional per-task tag color,
-- independent of its estado. Both confirmed with the user.
alter table public.plan_tareas
  add column percent_complete integer not null default 0 check (percent_complete between 0 and 100),
  add column color text;

-- 20261027090000_plan_proyectos_security_hardening.sql (finding C3)
-- restricted authenticated's UPDATE grant on plan_tareas to an explicit
-- column list. Re-issuing the full list (old columns + the two new ones)
-- rather than trying to "add" to a column-level grant, which Postgres
-- doesn't support incrementally in a readable way.
revoke update on public.plan_tareas from authenticated;
grant update (
  title,
  description,
  estado_id,
  priority,
  labels,
  start_date,
  due_date,
  assignee_id,
  ciclo_id,
  sort_order,
  percent_complete,
  color
) on public.plan_tareas to authenticated;
```

- [ ] **Step 2: STOP — hand this to the user**

Tell the user (in Spanish): paste the SQL above into the Supabase SQL Editor and run it. Do not continue to Task 3 until they confirm it ran successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261027140000_plan_tareas_percent_color.sql
git commit -m "$(cat <<'EOF'
feat(planificacion): add percent_complete and color columns to plan_tareas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Auto-rollup trigger for parent tasks' percent

**Files:**
- Create: `supabase/migrations/20261027150000_plan_tareas_percent_rollup.sql`

- [ ] **Step 1: Write the migration**

```sql
-- A task with direct sub-tasks has its percent_complete computed (not
-- user-editable): round(average of direct children). Reaching 100 also
-- moves it to that project's "completado" estado - same rule as a leaf
-- task reaching 100% manually (see actions.ts). This walks the whole
-- parent_task_id chain in one explicit loop per call, so it is safe for
-- unlimited-depth trees.
create or replace function public.plan_recompute_percent_chain(start_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_id uuid := start_id;
  current_proyecto_id uuid;
  avg_percent numeric;
  completado_estado_id uuid;
  iterations integer := 0;
begin
  -- Hard cap as a belt-and-suspenders defense: parent_task_id cycles
  -- shouldn't be possible (plan_set_tarea_ancestor_ids rejects a parent
  -- that would create one), but this guarantees the loop always
  -- terminates even if that invariant were ever broken elsewhere.
  while current_id is not null and iterations < 1000 loop
    iterations := iterations + 1;

    select proyecto_id into current_proyecto_id from public.plan_tareas where id = current_id;
    if not found then
      exit;
    end if;

    select avg(percent_complete) into avg_percent
    from public.plan_tareas
    where parent_task_id = current_id;

    if avg_percent is null then
      -- No children left (e.g. the last sub-task was just deleted) - this
      -- task is a leaf again; stop climbing and leave its value as-is.
      exit;
    end if;

    if round(avg_percent) >= 100 then
      select id into completado_estado_id
      from public.plan_estados
      where proyecto_id = current_proyecto_id and kind = 'completado';
      update public.plan_tareas
        set percent_complete = 100, estado_id = coalesce(completado_estado_id, estado_id)
        where id = current_id;
    else
      update public.plan_tareas set percent_complete = round(avg_percent) where id = current_id;
    end if;

    select parent_task_id into current_id from public.plan_tareas where id = current_id;
  end loop;
end;
$$;

-- pg_trigger_depth() > 1 means this firing was caused by an UPDATE the
-- function above just issued on an ancestor row, not by an original
-- app-level write. Skipping those re-entries is what keeps this to exactly
-- one controlled while-loop per real event instead of Postgres re-firing
-- the trigger recursively for every row the loop touches (which would
-- still terminate, since each recursion climbs one level higher, but
-- would redo the same work ancestor-count-squared times on a deep tree).
create or replace function public.plan_recompute_ancestor_percent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.parent_task_id is not null then
      perform public.plan_recompute_percent_chain(old.parent_task_id);
    end if;
    return old;
  end if;

  if new.parent_task_id is not null then
    perform public.plan_recompute_percent_chain(new.parent_task_id);
  end if;

  -- Re-parenting: the OLD parent also lost a child and must recompute.
  if tg_op = 'UPDATE' and old.parent_task_id is distinct from new.parent_task_id and old.parent_task_id is not null then
    perform public.plan_recompute_percent_chain(old.parent_task_id);
  end if;

  return new;
end;
$$;

create trigger plan_tareas_recompute_ancestor_percent
  after insert or delete or update of percent_complete, parent_task_id
  on public.plan_tareas
  for each row
  execute function public.plan_recompute_ancestor_percent();
```

- [ ] **Step 2: STOP — hand this to the user**

Tell the user (in Spanish): paste the SQL above into the Supabase SQL Editor and run it. Do not continue to Task 4 until they confirm it ran successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261027150000_plan_tareas_percent_rollup.sql
git commit -m "$(cat <<'EOF'
feat(planificacion): auto-compute parent task percent from sub-tasks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `actions.ts` — percent/color fields, sync rules, `updateTareaPercent`

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/actions.ts`

- [ ] **Step 1: Add `percentComplete`/`color`/`hasChildren` to `TareaListRow` and `RawTareaRow`, thread through both list functions**

Replace the `TareaListRow` interface (lines 126-144):

```typescript
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
  percentComplete: number;
  color: string | null;
  // Derived from whichever batch of tasks was fetched alongside this one
  // (true if any other row in that same fetch has this task as its
  // parent). Cheap given the existing "fetch everything small" pattern,
  // but only as complete as that fetch's own visibility - a task visible
  // only via direct assignment (not a project/share-cascaded view) could
  // have invisible children and read as a false leaf here. The
  // updateTareaPercent action re-checks hasChildren itself against the
  // database before writing, so that edge case can never corrupt data -
  // worst case here is a stale read-only/editable UI hint.
  hasChildren: boolean;
  relationship: "mio" | "asignado" | "compartido";
}
```

Replace `RawTareaRow` (lines 146-163) to add the two new selected columns:

```typescript
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
  percent_complete: number;
  color: string | null;
}
```

Replace `toTareaListRow` and `TAREA_SELECT` (lines 165-192):

```typescript
function toTareaListRow(t: RawTareaRow, callerId: string, hasChildren: boolean): TareaListRow {
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
    percentComplete: t.percent_complete,
    color: t.color,
    hasChildren,
    relationship,
  };
}

function withHasChildren(rows: RawTareaRow[], callerId: string): TareaListRow[] {
  const parentIds = new Set(rows.map((r) => r.parent_task_id).filter((id): id is string => id !== null));
  return rows.map((r) => toTareaListRow(r, callerId, parentIds.has(r.id)));
}

const TAREA_SELECT =
  "id, proyecto_id, plan_proyectos(name), parent_task_id, title, description, estado_id, plan_estados(name), priority, labels, start_date, due_date, assignee_id, ciclo_id, created_by, plan_tarea_modulos(modulo_id), percent_complete, color";
```

Replace the bodies of `listTareasVisibles` and `listTareasDeProyecto` (lines 200-230) to use `withHasChildren`:

```typescript
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

  return withHasChildren((data ?? []) as unknown as RawTareaRow[], user.id);
}

// One project's full tree - used by the project detail screen (a later task).
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

  return withHasChildren((data ?? []) as unknown as RawTareaRow[], user.id);
}
```

- [ ] **Step 2: Add `color` to `CreateTareaInput`/`UpdateTareaInput`, set initial percent in `createTarea`**

Replace `CreateTareaInput` (lines 232-245):

```typescript
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
  color: string | null;
}
```

In `createTarea` (lines 247-288), add `percent_complete` and `color` to the insert payload:

```typescript
  const newId = crypto.randomUUID();
  const { error } = await supabase.from("plan_tareas").insert({
    id: newId,
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
    // Assigning a task sets it to 5% up front - confirmed with the user
    // ("asignada sería un 5%"). A brand-new task has no children yet, so
    // it's always a leaf at creation time.
    percent_complete: input.assigneeId ? 5 : 0,
    color: input.color,
  });
  if (error) return { error: error.message };
```

- [ ] **Step 3: Add the shared estado/percent sync helper, `updateTarea`, `updateTareaEstado`, and the new `updateTareaPercent`**

Add this helper just above `updateTarea` (before line 305):

```typescript
// Shared by updateTarea (editing the Estado field directly) and
// updateTareaEstado (drag-and-drop on the Tablero) - both paths change
// estado_id and must apply the same sync rule: setting the estado to the
// project's "completado" kind forces percent to 100; moving a task that
// was at 100% to any other estado forces it down to 99%, so a task can
// never sit at 100% while not actually marked Completado. Callers must
// skip this entirely for tasks with children (checked by the caller) -
// a parent's percent is owned by the plan_recompute_percent_chain trigger,
// never by this sync rule.
async function resolveEstadoPercentSideEffects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tareaId: string,
  newEstadoId: string,
): Promise<{ percentComplete?: number }> {
  const { data: target } = await supabase.from("plan_estados").select("kind").eq("id", newEstadoId).maybeSingle();
  if (target?.kind === "completado") return { percentComplete: 100 };

  const { data: current } = await supabase.from("plan_tareas").select("percent_complete").eq("id", tareaId).maybeSingle();
  if (current?.percent_complete === 100) return { percentComplete: 99 };

  return {};
}
```

Replace `UpdateTareaInput` and `updateTarea` (lines 290-338):

```typescript
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
  color: string | null;
}

export async function updateTarea(input: UpdateTareaInput): Promise<ActionResult> {
  const supabase = await createClient();
  if (!input.title.trim()) return { error: "El título es obligatorio" };

  const { data: currentRow } = await supabase
    .from("plan_tareas")
    .select("assignee_id, percent_complete")
    .eq("id", input.id)
    .maybeSingle();
  const { data: children } = await supabase.from("plan_tareas").select("id").eq("parent_task_id", input.id).limit(1);
  const hasChildren = Boolean(children && children.length > 0);

  const updatePayload: Record<string, unknown> = {
    title: input.title.trim(),
    description: input.description.trim() || null,
    estado_id: input.estadoId,
    priority: input.priority,
    labels: input.labels,
    start_date: input.startDate,
    due_date: input.dueDate,
    assignee_id: input.assigneeId,
    ciclo_id: input.cicloId,
    color: input.color,
  };

  if (!hasChildren) {
    if (input.estadoId) {
      const sideEffect = await resolveEstadoPercentSideEffects(supabase, input.id, input.estadoId);
      if (sideEffect.percentComplete !== undefined) updatePayload.percent_complete = sideEffect.percentComplete;
    }
    // Estado-driven sync takes priority over the assignment bump below -
    // e.g. assigning a task while also setting it to Completado in the
    // same save must land on 100%, not 5%.
    if (updatePayload.percent_complete === undefined) {
      const assigningForFirstTime = !currentRow?.assignee_id && Boolean(input.assigneeId);
      if (assigningForFirstTime && (currentRow?.percent_complete ?? 0) === 0) {
        updatePayload.percent_complete = 5;
      }
    }
  }

  const { data, error } = await supabase.from("plan_tareas").update(updatePayload).eq("id", input.id).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };

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
```

Replace `updateTareaEstado` (lines 340-355 including its comment):

```typescript
// proyectoId FIRST (unlike every other action in this file) so the project
// detail page can pass `updateTareaEstado.bind(null, proyectoId)` down to
// the client-side ProyectosWorkspace as a `(tareaId, estadoId) =>
// Promise<ActionResult>` bound Server Action - only a Server Action (not a
// plain closure) can cross the server-to-client prop boundary, and `.bind`
// only partially applies arguments from the front, which is why
// proyectoId is first here.
export async function updateTareaEstado(proyectoId: string, tareaId: string, estadoId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: children } = await supabase.from("plan_tareas").select("id").eq("parent_task_id", tareaId).limit(1);
  const hasChildren = Boolean(children && children.length > 0);

  const updatePayload: { estado_id: string; percent_complete?: number } = { estado_id: estadoId };
  if (!hasChildren) {
    const sideEffect = await resolveEstadoPercentSideEffects(supabase, tareaId, estadoId);
    if (sideEffect.percentComplete !== undefined) updatePayload.percent_complete = sideEffect.percentComplete;
  }

  const { data, error } = await supabase.from("plan_tareas").update(updatePayload).eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };
  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

Add `updateTareaPercent` right after `updateTareaEstado`:

```typescript
// Leaf tasks only - a task with children has its percent computed by the
// plan_recompute_percent_chain trigger and is never user-editable. This is
// enforced here (not just hidden in the UI): a direct call for a task that
// has gained children since the page loaded is rejected rather than
// silently corrupting the computed value.
export async function updateTareaPercent(proyectoId: string, tareaId: string, percent: number): Promise<ActionResult> {
  const supabase = await createClient();
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) return { error: "Porcentaje inválido" };

  const { data: children } = await supabase.from("plan_tareas").select("id").eq("parent_task_id", tareaId).limit(1);
  if (children && children.length > 0) {
    return { error: "El % de esta tarea se calcula automáticamente a partir de sus subtareas" };
  }

  const updatePayload: { percent_complete: number; estado_id?: string } = { percent_complete: percent };

  if (percent === 100) {
    const { data: completado } = await supabase
      .from("plan_estados")
      .select("id")
      .eq("proyecto_id", proyectoId)
      .eq("kind", "completado")
      .maybeSingle();
    if (completado) updatePayload.estado_id = completado.id;
  } else {
    const { data: current } = await supabase
      .from("plan_tareas")
      .select("estado_id, plan_estados(kind)")
      .eq("id", tareaId)
      .maybeSingle();
    const estadoRef = current?.plan_estados;
    const currentKind = Array.isArray(estadoRef) ? estadoRef[0]?.kind : estadoRef?.kind;
    if (currentKind === "completado") {
      const { data: enProceso } = await supabase
        .from("plan_estados")
        .select("id")
        .eq("proyecto_id", proyectoId)
        .eq("kind", "en_proceso")
        .maybeSingle();
      if (enProceso) updatePayload.estado_id = enProceso.id;
    }
  }

  const { data, error } = await supabase.from("plan_tareas").update(updatePayload).eq("id", tareaId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "No autorizado o el registro ya no existe" };

  revalidatePath("/planificacion");
  revalidatePath(`/planificacion/proyectos/${proyectoId}`);
  return {};
}
```

- [ ] **Step 4: Verify**

Run: `bunx tsc --noEmit`
Expected: no errors (the next task fixes the call sites in `createTarea`/`updateTarea` callers that don't yet pass `color` — that's expected to fail until Task 5/6 update them; if `tsc` complains only about `CreateTareaInput`/`UpdateTareaInput` missing `color` in `TareaCreateDialog.tsx`/`TareaDetailModal.tsx`, that's fine, continue).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/actions.ts"
git commit -m "$(cat <<'EOF'
feat(planificacion): task percent/color fields and estado sync rules

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `EstadosEditor.tsx` — protect default chips, collapse the add-form

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/EstadosEditor.tsx` (full rewrite, 72 lines)

- [ ] **Step 1: Rewrite the file**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEstado, deleteEstado, type EstadoOption } from "./actions";

export const ESTADO_COLORS = ["#94a3b8", "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6"];

export function EstadosEditor({ proyectoId, estados }: { proyectoId: string; estados: EstadoOption[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(ESTADO_COLORS[0]);
  const [isPending, startTransition] = useTransition();

  function add() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createEstado(proyectoId, name, color);
      setName("");
      setAdding(false);
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
            {!e.isDefault && (
              <button type="button" onClick={() => remove(e.id)} disabled={isPending}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {adding ? (
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
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)} className="gap-1.5 text-xs text-muted-foreground">
          <Plus className="size-3.5" />
          Agregar estado personalizado
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/EstadosEditor.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/EstadosEditor.tsx"
git commit -m "$(cat <<'EOF'
feat(planificacion): protect default estado chips, collapse add-form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `TareaCreateDialog.tsx` — remove Ciclo/Módulos UI, add color picker

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx`

- [ ] **Step 1: Remove the `SIN_CICLO` sentinel and `cicloId` state, add `color` state**

Replace lines 30-62 (from the `SIN_CICLO` comment through the state declarations):

```typescript
export function TareaCreateDialog({
  proyectoId,
  parentTaskId,
  estados,
  assignees,
  ciclos,
  modulos,
  triggerLabel,
}: {
  proyectoId: string;
  parentTaskId: string | null;
  estados: EstadoOption[];
  assignees: AssigneeOption[];
  ciclos: CicloRow[];
  modulos: ModuloRow[];
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
  const [moduloIds, setModuloIds] = useState<string[]>([]);
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
```

`ciclos`/`modulos` stay as required props (still fetched server-side in Task 9, just unused by this component's JSX from this task onward until Task 9 actually stops passing them) - keep the destructured `ciclos`/`modulos` parameters even though the JSX referencing `cicloId`/`ciclos` is removed next, so Task 9 is the only task that touches the prop signature.

Wait - `modulos` is still used by the Módulos checklist block below, which Task 9 removes. For this task, leave the `modulos` block as-is; only remove the Ciclo block and `cicloId` state/import. Since `cicloId` is being deleted, also remove it from `createTarea`'s call and `reset()`.

- [ ] **Step 2: Update `reset()` and `submit()`**

Replace `reset()` (lines 66-76):

```typescript
  function reset() {
    setTitle("");
    setDescription("");
    setPriority("");
    setStartDate("");
    setDueDate("");
    setAssigneeId("");
    setModuloIds([]);
    setColor(null);
    setError(null);
  }
```

Replace `submit()` (lines 82-107):

```typescript
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
        moduloIds,
        color,
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
```

- [ ] **Step 3: Remove the Ciclo `<Select>` block, add a color swatch picker**

Remove the entire Ciclo block (lines 184-201):

```tsx
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Ciclo</label>
            <Select value={cicloId} onValueChange={(v) => v && setCicloId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {() => (cicloId === SIN_CICLO ? "Sin ciclo" : ciclos.find((c) => c.id === cicloId)?.name ?? "Sin ciclo")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CICLO}>Sin ciclo</SelectItem>
                {ciclos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

In its place, add a color picker:

```tsx
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Color</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`flex size-6 items-center justify-center rounded-full border-2 text-muted-foreground ${color === null ? "border-foreground" : "border-transparent"}`}
                title="Sin color"
              >
                <X className="size-3" />
              </button>
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
          </div>
```

- [ ] **Step 4: Update imports**

Replace the top imports (lines 1-23):

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
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
import { createTarea, type CicloRow, type EstadoOption, type ModuloRow } from "./actions";
import { ESTADO_COLORS } from "./EstadosEditor";
```

- [ ] **Step 5: Verify**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx"`
Expected: no errors. `CicloRow` import stays used (prop type); `ciclos` prop is now unused inside the component body, which eslint may flag as an unused variable - if so, prefix it `_ciclos` is NOT an option (it's a destructured named prop used nowhere); instead keep it referenced by leaving the prop in the destructuring signature only (TypeScript/eslint don't flag unused destructured function parameters by default in this repo's config - confirm by running eslint; if it does flag it, remove `ciclos` from the destructuring but keep it in the type signature using `_ciclos` is not idiomatic here, so instead just drop the parameter from destructuring while keeping it in the props type is inconsistent - simplest fix if eslint complains: delete `ciclos` from both the destructured parameters AND the type's prop, and delete the `CicloRow` import, and update the one caller in `[id]/page.tsx` to stop passing `ciclos=` to `TareaCreateDialog` (Task 9 already removes `CiclosManager`'s mount, so this is a 2-line follow-up in that same task's file if needed).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/TareaCreateDialog.tsx"
git commit -m "$(cat <<'EOF'
feat(planificacion): remove ciclo picker, add task color swatch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `TareaDetailModal.tsx` — percent control, color picker, remove Ciclo

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx`

- [ ] **Step 1: Update imports and add percent/color state**

Replace lines 1-35:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Paperclip, Pencil, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addAdjunto,
  addComentario,
  deleteTarea,
  listAdjuntos,
  listComentarios,
  removeAdjunto,
  updateTarea,
  updateTareaPercent,
  type ComentarioRow,
  type EstadoOption,
  type TareaAdjuntoRow,
  type TareaListRow,
} from "./actions";
import { CompartirDialog } from "./CompartirDialog";
import { ESTADO_COLORS } from "./EstadosEditor";
import type { AssigneeOption } from "./TareaCreateDialog";
```

Note `CicloRow` is dropped from the import (no longer referenced) and `ciclos` is dropped from props - update the function signature (lines 37-49):

```tsx
export function TareaDetailModal({
  tarea,
  onClose,
  estados = [],
  assignees = [],
}: {
  tarea: TareaListRow | null;
  onClose: () => void;
  estados?: EstadoOption[];
  assignees?: AssigneeOption[];
}) {
```

- [ ] **Step 2: Add `localPercent`/`color` state, reset them alongside the existing `lastTareaId` guard**

Replace lines 50-78 (state declarations through the `lastTareaId` reset block):

```tsx
  const router = useRouter();
  const [adjuntos, setAdjuntos] = useState<TareaAdjuntoRow[]>([]);
  const [comentarios, setComentarios] = useState<ComentarioRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja" | "">("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [localPercent, setLocalPercent] = useState(0);
  const [lastTareaId, setLastTareaId] = useState<string | null>(null);

  // Reset edit/error state when switching to a different task (or closing
  // the modal) - done during render, not in the effect below, since
  // synchronously calling setState inside an effect body is a cascading-
  // render anti-pattern; this is React's documented "adjust state while
  // rendering" alternative, guarded by lastTareaId so it only fires once
  // per task change.
  if ((tarea?.id ?? null) !== lastTareaId) {
    setLastTareaId(tarea?.id ?? null);
    setIsEditing(false);
    setError(null);
    setLocalPercent(tarea?.percentComplete ?? 0);
  }
```

- [ ] **Step 3: Update `startEdit`/`saveEdit`, remove `cicloId`**

Replace `startEdit` and `saveEdit` (lines 90-139):

```tsx
  function startEdit() {
    if (!tarea) return;
    setTitle(tarea.title);
    setDescription(tarea.description ?? "");
    setEstadoId(tarea.estadoId ?? "");
    setPriority(tarea.priority ?? "");
    setStartDate(tarea.startDate ?? "");
    setDueDate(tarea.dueDate ?? "");
    setAssigneeId(tarea.assigneeId ?? "");
    setColor(tarea.color);
    setError(null);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setError(null);
  }

  function saveEdit() {
    if (!tarea) return;
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateTarea({
        id: tarea.id,
        proyectoId: tarea.proyectoId,
        title,
        description,
        estadoId: estados.length > 0 ? estadoId || null : tarea.estadoId,
        priority: priority || null,
        labels: tarea.labels,
        startDate: startDate || null,
        dueDate: dueDate || null,
        assigneeId: assignees.length > 0 ? assigneeId || null : tarea.assigneeId,
        cicloId: tarea.cicloId,
        moduloIds: tarea.moduloIds,
        color,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      onClose();
      router.refresh();
    });
  }

  function savePercent(value: number) {
    if (!tarea) return;
    setLocalPercent(value);
    setError(null);
    startTransition(async () => {
      const result = await updateTareaPercent(tarea.proyectoId, tarea.id, value);
      if (result.error) {
        setError(result.error);
        setLocalPercent(tarea.percentComplete);
        return;
      }
      router.refresh();
    });
  }
```

- [ ] **Step 4: Add the "Avance" block and remove the Ciclo `<Select>` from the edit form**

Insert right after the opening `{error && ...}` line (after line 215, before the `isEditing ? (` block that starts the edit form):

```tsx
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">Avance</span>
            <span className="font-semibold text-foreground">{tarea.hasChildren ? tarea.percentComplete : localPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#04B1AF] transition-all"
              style={{ width: `${tarea.hasChildren ? tarea.percentComplete : localPercent}%` }}
            />
          </div>
          {tarea.hasChildren ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Calculado a partir de las subtareas</p>
          ) : (
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={localPercent}
              disabled={isPending}
              onChange={(e) => setLocalPercent(Number(e.target.value))}
              onMouseUp={(e) => savePercent(Number(e.currentTarget.value))}
              onTouchEnd={(e) => savePercent(Number(e.currentTarget.value))}
              className="mt-1.5 w-full"
            />
          )}
        </div>
```

Remove the Ciclo block from the edit form (lines 289-308):

```tsx
            {ciclos.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Ciclo</label>
                <Select value={cicloId} onValueChange={(v) => v && setCicloId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {() => (cicloId === SIN_CICLO ? "Sin ciclo" : ciclos.find((c) => c.id === cicloId)?.name ?? "Sin ciclo")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_CICLO}>Sin ciclo</SelectItem>
                    {ciclos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
```

Replace it with a color picker (editable even for tasks with children, since color is independent of the percent rollup):

```tsx
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Color</label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className={`flex size-6 items-center justify-center rounded-full border-2 text-muted-foreground ${color === null ? "border-foreground" : "border-transparent"}`}
                  title="Sin color"
                >
                  <X className="size-3" />
                </button>
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
            </div>
```

- [ ] **Step 5: Verify**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"`
Expected: no errors. The `SIN_CICLO` constant (previously lines 32-35) is now unused - delete it.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"
git commit -m "$(cat <<'EOF'
feat(planificacion): progress slider and color picker on task detail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `TableroView.tsx` — percent badge + color dot on cards

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/TableroView.tsx:70-86`

- [ ] **Step 1: Replace the card JSX**

```tsx
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
                  <div className="flex items-center gap-1.5">
                    {t.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                    <p className="truncate font-semibold text-foreground">{t.title}</p>
                  </div>
                  <p className="truncate text-muted-foreground">{t.proyectoName}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    {t.dueDate ? <p className="text-muted-foreground">{t.dueDate}</p> : <span />}
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {t.percentComplete}%
                    </span>
                  </div>
                </button>
              ))}
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/TableroView.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/TableroView.tsx"
git commit -m "$(cat <<'EOF'
feat(planificacion): show progress % and color dot on Tablero cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Hide Ciclos/Módulos, add "Volver a Planificación" link

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/[id]/page.tsx`

- [ ] **Step 1: Remove the `CiclosManager`/`ModulosManager` mounts and imports, add the back link**

Replace the full file:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

export default async function ProyectoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const proyecto = await getProyecto(id);
  if (!proyecto) redirect("/planificacion");

  // Ciclos/Módulos are still fetched (TareaCreateDialog's props still
  // expect them) but no longer have any management UI mounted on this
  // page, and TareaCreateDialog/TareaDetailModal no longer render a
  // picker for either - confirmed with the user, who found both
  // unnecessary for now. Nothing in the schema or these actions changed;
  // this is a UI-only hide, matching this app's "retire, don't delete"
  // precedent already used for the old POA screens.
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
        <Link
          href="/planificacion"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Planificación
        </Link>

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
              ciclos={ciclos}
              modulos={modulos}
              triggerLabel="Nueva tarea"
            />
          </div>
        </div>

        <EstadosEditor proyectoId={id} estados={estados} />

        <ProyectosWorkspace
          tasks={tasks}
          columns={columns}
          columnKeyBy="estadoId"
          onDropEstado={updateTareaEstado.bind(null, id)}
          defaultProyectoId={id}
          estados={estados}
          assignees={assignees}
        />
      </div>
    </div>
  );
}
```

Note: `ProyectosWorkspace`'s `ciclos` prop is optional (defaults to `[]` per its own type signature from the earlier delivery) and is only used to pass through to `TareaDetailModal`, which no longer accepts a `ciclos` prop as of Task 7 - so `ProyectosWorkspace.tsx` needs a one-line follow-up: remove the `ciclos={ciclos}` line it currently passes to `<TareaDetailModal>` (around its own line 113), since that prop no longer exists on `TareaDetailModal`. Do this in this same task.

- [ ] **Step 2: Remove the stale `ciclos` prop from `ProyectosWorkspace.tsx`'s `<TareaDetailModal>` call**

In `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`, replace the final render block (lines 108-114):

```tsx
      <TareaDetailModal
        tarea={selected}
        onClose={() => setSelected(null)}
        estados={estados}
        assignees={assignees}
      />
```

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/[id]/page.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/[id]/page.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"
git commit -m "$(cat <<'EOF'
feat(planificacion): hide ciclos/modulos UI, add back link to project list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Final verification, smoke test, preview deploy

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck and lint**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bunx eslint "src/app/(app)/planificacion/**/*.tsx" "src/app/(app)/planificacion/**/*.ts"`
Expected: no errors.

- [ ] **Step 2: Build**

Run: `bunx next build`
Expected: build succeeds.

- [ ] **Step 3: Deploy a preview**

Run: `bunx vercel`
Expected: a preview URL is produced. Report it to the user.

- [ ] **Step 4: Hand the user this manual smoke-test script (in Spanish)**

1. Crea una tarea nueva sin asignar — confirma que el % de avance empieza en 0.
2. Asígnale un responsable — confirma que el % sube a 5 automáticamente.
3. Sube el % manualmente hasta 100 con el control deslizante — confirma que el estado cambia solo a "Completado".
4. Mueve esa misma tarea a otro estado (arrastrándola en el Tablero, o desde el detalle) — confirma que el % baja a 99.
5. Crea 3 subtareas bajo una tarea — confirma que el % de la tarea padre ya no se puede editar a mano y que refleja el promedio de las 3 subtareas (p. ej. si subes una subtarea a 100% y las otras 2 en 0%, el padre debe marcar 33%).
6. Intenta borrar uno de los 4 estados base (En espera/En proceso/Completado/Cancelado) — confirma que no aparece la opción de borrarlo.
7. Agrega un estado personalizado nuevo — confirma que sigue funcionando y que sí se puede borrar.
8. Asígnale un color a una tarea — confirma que el punto de color aparece en su tarjeta del Tablero.
9. Confirma que Ciclos y Módulos ya no aparecen en ninguna pantalla de Planificación.
10. Desde el detalle de un proyecto, usa el enlace "Volver a Planificación" y confirma que regresa a la lista de proyectos.

- [ ] **Step 5: STOP — wait for the user's "sí, despliega" before running `bunx vercel --prod`.**

---

## Self-review notes (writing-plans skill step)

- **Spec coverage:** all 5 spec sections have a task — protected estados (Task 1), percent sync rules (Tasks 2-4), parent rollup trigger (Task 3), task color (Tasks 4, 6-8), Ciclos/Módulos hiding (Task 9), back link (Task 9). Smoke test (Task 10) exercises every rule from the spec.
- **Trigger recursion safety:** `pg_trigger_depth() > 1` guard (Task 3) means the trigger's own cascading UPDATEs never re-enter the recompute logic - only the original external write runs the while-loop, which itself has a 1000-iteration hard cap as a second, independent safeguard.
- **Column-grant coverage:** Task 2's migration re-grants the complete authenticated UPDATE column list (old columns + `percent_complete` + `color`) in one `revoke`+`grant` pair, so no write path introduced in Task 4 (`updateTarea`, `updateTareaEstado`, `updateTareaPercent`) can silently fail against that allowlist.
- **Parent-percent read-only enforcement:** enforced in three independent places - the UI shows a progress bar instead of a slider when `tarea.hasChildren` (Task 7), `updateTareaPercent` rejects the call server-side if the task has children (Task 4), and `updateTarea`/`updateTareaEstado` both skip all percent side effects entirely when `hasChildren` is true (Task 4), leaving that column exclusively owned by the Task 3 trigger for such tasks.
