# Aprendizaje — Fase 1 (Cursos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable slice of the Aprendizaje module: managers create courses (categoría *curso* or *historia*) with ordered lessons (video link or SharePoint-uploaded video, text, attached guides/images), and employees browse a catalog, take lessons and track their progress.

**Architecture:** New `aprendizaje` module in `modules`/`role_profile_permissions`. Five tables with RLS; progress and completion are written only through a `security definer` RPC (`aprendizaje_marcar_leccion`). Files go to SharePoint through a Graph *resumable upload session*: a server action creates the session, the browser PUTs 5 MiB chunks straight to the pre-authenticated `uploadUrl` (Vercel caps bodies at ~4.5 MB), and a permission-checked API route redirects to Graph's short-lived download URL for playback. Pure logic (mapping, video-link parsing, upload chunking, file validation) lives in `src/lib/aprendizaje/` and is unit-tested.

**Tech Stack:** Next.js 16 App Router (server components + server actions; `params`/`searchParams` are Promises), Supabase (Postgres RLS, `security definer` functions), Microsoft Graph (SharePoint), Tailwind + base-ui components in `src/components/ui`, Vitest + Testing Library (jsdom), Bun for running tools (`bun x …`) because the local Node install is broken.

**Spec:** `docs/superpowers/specs/2026-11-25-aprendizaje-design.md` (this plan covers *Fase 1* only; *Asignaciones*, *Evaluaciones* and *Gamificación* get their own plans).

**Conventions to follow (read before starting):**
- Run tools with Bun: `bun x vitest run <path>`, `bun x tsc --noEmit -p .`, `bun x eslint <paths>`.
- `"use server"` files may only export async functions (type exports are fine). Shared helpers/constants go in `src/lib/aprendizaje/`.
- Server actions return `{ error?: string }`-style results instead of throwing; UI shows `result.error`.
- Permission checks: `supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" })` (see `src/app/(app)/planificacion/actions.ts:17`).
- User-facing text is Spanish; code comments explain *why*.
- Integration tests in `src/test/integration/` hit the real Supabase project from `.env.local`; they need the migrations applied first (Task 3).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261125100000_aprendizaje_module.sql` | Register module + default grants |
| `supabase/migrations/20261125100100_aprendizaje_cursos.sql` | Tables, RLS, helper + RPC functions |
| `src/lib/aprendizaje/types.ts` | Shared domain types, labels, `archivoUrl()` |
| `src/lib/aprendizaje/mapCurso.ts` | Raw Supabase rows → domain objects; progress helpers |
| `src/lib/aprendizaje/videoEmbed.ts` | Video link → iframe/link |
| `src/lib/aprendizaje/files.ts` | Upload kinds, limits, validation |
| `src/lib/aprendizaje/chunkedUpload.ts` | Browser chunked PUT to a Graph upload session |
| `src/lib/sharepoint.ts` (modify) | `createSharePointUploadSession()` |
| `src/app/api/aprendizaje/archivo/[driveId]/[itemId]/route.ts` | Permission-checked redirect to a SharePoint file |
| `src/app/(app)/aprendizaje/actions.ts` | Learner server actions (flags, catalog, course, mark lesson) |
| `src/app/(app)/aprendizaje/gestion/actions.ts` | Manager server actions (CRUD, status, reorder, uploads) |
| `src/app/(app)/aprendizaje/page.tsx`, `CursoCard.tsx` | Catalog |
| `src/app/(app)/aprendizaje/[cursoId]/page.tsx`, `CursoViewer.tsx`, `LeccionContent.tsx` | Take a course |
| `src/app/(app)/aprendizaje/gestion/page.tsx`, `NuevoCursoDialog.tsx` | Manager course list |
| `src/app/(app)/aprendizaje/gestion/[cursoId]/page.tsx`, `CursoEditor.tsx`, `LeccionEditor.tsx`, `SharePointUploadButton.tsx` | Course editor |
| `src/app/(app)/layout.tsx`, `src/app/(app)/Sidebar.tsx` (modify) | Menu entry |

---

### Task 1: Migration — register the module

**Files:**
- Create: `supabase/migrations/20261125100000_aprendizaje_module.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Registers the "Aprendizaje" module (cursos, historia, evaluaciones,
-- gamificación - see docs/superpowers/specs/2026-11-25-aprendizaje-design.md).
-- can_view   = browse the catalog and take courses.
-- can_manage = create/edit courses, assign them, see everyone's progress.
-- Approved with the user: can_view is granted to EVERY role profile because
-- this is company-wide training. It is still an explicit, revocable row in
-- Perfiles de rol (nothing is open to "any authenticated user" without the
-- permission). can_manage starts with Super Admin only.
insert into public.modules (key, label) values ('aprendizaje', 'Aprendizaje');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select
  rp.id,
  m.id,
  true,
  false,
  false,
  false,
  false,
  (rp.name = 'Super Admin'),
  false
from public.role_profiles rp
cross join public.modules m
where m.key = 'aprendizaje';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261125100000_aprendizaje_module.sql
git commit -m "feat(aprendizaje): register the aprendizaje module and default grants"
```

---

### Task 2: Migration — tables, RLS and functions

**Files:**
- Create: `supabase/migrations/20261125100100_aprendizaje_cursos.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Fase 1 of Aprendizaje: courses, ordered lessons, lesson files, and
-- per-user progress. Progress/enrollment rows are NEVER written by clients
-- directly (no insert/update policies) - only through
-- aprendizaje_marcar_leccion, so nobody can fake a completed course.

create or replace function public.aprendizaje_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select can_view or can_manage from public.get_my_module_permissions('aprendizaje')), false);
$$;

create or replace function public.aprendizaje_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select can_manage from public.get_my_module_permissions('aprendizaje')), false);
$$;

create or replace function public.aprendizaje_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.aprendizaje_cursos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  category text not null check (category in ('curso', 'historia')),
  status text not null default 'borrador' check (status in ('borrador', 'publicado', 'archivado')),
  cover_drive_id text,
  cover_item_id text,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cover_drive_id is null) = (cover_item_id is null))
);

create trigger aprendizaje_cursos_touch
before update on public.aprendizaje_cursos
for each row execute function public.aprendizaje_touch_updated_at();

create table public.aprendizaje_lecciones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  position int not null,
  title text not null check (length(trim(title)) > 0),
  body text,
  video_url text,
  video_drive_id text,
  video_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferrable so aprendizaje_reordenar_lecciones can permute positions in
  -- one statement without tripping over transient duplicates.
  constraint aprendizaje_lecciones_position_unique unique (curso_id, position) deferrable initially deferred,
  check ((video_drive_id is null) = (video_item_id is null)),
  -- A lesson's video is either an external link or a SharePoint file, never both.
  check (video_url is null or video_drive_id is null)
);

create index aprendizaje_lecciones_curso_idx on public.aprendizaje_lecciones (curso_id);

create trigger aprendizaje_lecciones_touch
before update on public.aprendizaje_lecciones
for each row execute function public.aprendizaje_touch_updated_at();

create table public.aprendizaje_leccion_archivos (
  id uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.aprendizaje_lecciones (id) on delete cascade,
  filename text not null,
  content_type text not null,
  size_bytes bigint,
  drive_id text not null,
  item_id text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index aprendizaje_leccion_archivos_leccion_idx on public.aprendizaje_leccion_archivos (leccion_id);

create table public.aprendizaje_inscripciones (
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (curso_id, app_user_id)
);

create index aprendizaje_inscripciones_user_idx on public.aprendizaje_inscripciones (app_user_id);

create table public.aprendizaje_progreso_lecciones (
  leccion_id uuid not null references public.aprendizaje_lecciones (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (leccion_id, app_user_id)
);

create index aprendizaje_progreso_user_idx on public.aprendizaje_progreso_lecciones (app_user_id);

alter table public.aprendizaje_cursos enable row level security;
alter table public.aprendizaje_lecciones enable row level security;
alter table public.aprendizaje_leccion_archivos enable row level security;
alter table public.aprendizaje_inscripciones enable row level security;
alter table public.aprendizaje_progreso_lecciones enable row level security;

-- Cursos: managers see everything; learners only published courses.
create policy "aprendizaje_cursos_select" on public.aprendizaje_cursos
  for select using (public.aprendizaje_can_manage() or (status = 'publicado' and public.aprendizaje_can_view()));
create policy "aprendizaje_cursos_insert" on public.aprendizaje_cursos
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_cursos_update" on public.aprendizaje_cursos
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_cursos_delete" on public.aprendizaje_cursos
  for delete using (public.aprendizaje_can_manage());

-- Lecciones/archivos inherit visibility from their course (the subquery
-- runs under the caller's own RLS on aprendizaje_cursos).
create policy "aprendizaje_lecciones_select" on public.aprendizaje_lecciones
  for select using (exists (select 1 from public.aprendizaje_cursos c where c.id = curso_id));
create policy "aprendizaje_lecciones_insert" on public.aprendizaje_lecciones
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_lecciones_update" on public.aprendizaje_lecciones
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_lecciones_delete" on public.aprendizaje_lecciones
  for delete using (public.aprendizaje_can_manage());

create policy "aprendizaje_leccion_archivos_select" on public.aprendizaje_leccion_archivos
  for select using (exists (select 1 from public.aprendizaje_lecciones l where l.id = leccion_id));
create policy "aprendizaje_leccion_archivos_insert" on public.aprendizaje_leccion_archivos
  for insert with check (public.aprendizaje_can_manage());
create policy "aprendizaje_leccion_archivos_update" on public.aprendizaje_leccion_archivos
  for update using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_leccion_archivos_delete" on public.aprendizaje_leccion_archivos
  for delete using (public.aprendizaje_can_manage());

-- Progress: read your own, managers read all. No write policies at all.
create policy "aprendizaje_inscripciones_select" on public.aprendizaje_inscripciones
  for select using (app_user_id = auth.uid() or public.aprendizaje_can_manage());
create policy "aprendizaje_progreso_select" on public.aprendizaje_progreso_lecciones
  for select using (app_user_id = auth.uid() or public.aprendizaje_can_manage());

-- Internal: sets completed_at once every lesson of the course is done.
-- Later phases extend this (evaluation passed, badges). Never revokes a
-- completion if lessons are added afterwards.
create or replace function public.aprendizaje_recalcular_completitud(p_curso_id uuid, p_app_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_done int;
begin
  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = p_app_user_id;

  if v_total > 0 and v_done >= v_total then
    update aprendizaje_inscripciones
    set completed_at = now()
    where curso_id = p_curso_id and app_user_id = p_app_user_id and completed_at is null;
  end if;
end;
$$;

revoke execute on function public.aprendizaje_recalcular_completitud(uuid, uuid) from public, anon, authenticated;

create or replace function public.aprendizaje_marcar_leccion(p_leccion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_curso_id uuid;
  v_status text;
begin
  if v_user is null or not public.aprendizaje_can_view() then
    raise exception 'No autorizado';
  end if;

  select l.curso_id, c.status into v_curso_id, v_status
  from aprendizaje_lecciones l
  join aprendizaje_cursos c on c.id = l.curso_id
  where l.id = p_leccion_id;

  if v_curso_id is null then
    raise exception 'Lección no encontrada';
  end if;
  if v_status <> 'publicado' then
    raise exception 'El curso no está publicado';
  end if;

  insert into aprendizaje_inscripciones (curso_id, app_user_id)
  values (v_curso_id, v_user)
  on conflict do nothing;

  insert into aprendizaje_progreso_lecciones (leccion_id, app_user_id)
  values (p_leccion_id, v_user)
  on conflict do nothing;

  perform public.aprendizaje_recalcular_completitud(v_curso_id, v_user);
end;
$$;

revoke execute on function public.aprendizaje_marcar_leccion(uuid) from public, anon;
grant execute on function public.aprendizaje_marcar_leccion(uuid) to authenticated;

-- Runs as the caller (security invoker), so the update policies above still
-- apply; the explicit check gives a clear error instead of a silent no-op.
create or replace function public.aprendizaje_reordenar_lecciones(p_curso_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.aprendizaje_can_manage() then
    raise exception 'No autorizado';
  end if;

  update aprendizaje_lecciones l
  set position = t.ord - 1
  from unnest(p_ids) with ordinality as t(id, ord)
  where l.id = t.id and l.curso_id = p_curso_id;
end;
$$;

revoke execute on function public.aprendizaje_reordenar_lecciones(uuid, uuid[]) from public, anon;
grant execute on function public.aprendizaje_reordenar_lecciones(uuid, uuid[]) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261125100100_aprendizaje_cursos.sql
git commit -m "feat(aprendizaje): cursos, lecciones, archivos and progress tables with RLS"
```

---

### Task 3: Apply migrations (requires the user)

The migrations change the **production** Supabase project. Do not run this without the user's explicit go-ahead in the conversation.

- [ ] **Step 1: Ask the user** to paste each file, in order, into the Supabase **SQL Editor** and run it: first `supabase/migrations/20261125100000_aprendizaje_module.sql`, then `supabase/migrations/20261125100100_aprendizaje_cursos.sql`. Tell them explicitly that these are the final migrations to run now.

Do **not** use `supabase db push`: the CLI isn't configured in this project (no `SUPABASE_DB_PASSWORD`), and it would also try to apply every other pending migration, including the deliberately unapplied destructive Horarios cleanup (`20260811160000_drop_legacy_schedule_columns.sql`).

Both migrations are purely additive (new module row, new tables/functions), so they are safe to apply before or after deploying the code: without them the menu entry stays hidden and the pages redirect, because nobody has the `aprendizaje` permission yet.

Expected: both run without errors.

---

### Task 4: RLS integration tests

**Files:**
- Create: `src/test/integration/aprendizajeRls.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("aprendizaje RLS", () => {
  let manager: TestUser;
  let learner: TestUser;
  let otherLearner: TestUser;
  const cursoIds: string[] = [];

  beforeAll(async () => {
    manager = await createTestUser("Super Admin");
    learner = await createTestUser("Viewer");
    otherLearner = await createTestUser("Viewer");
  }, 60_000);

  afterAll(async () => {
    const admin = createAdminClient();
    if (cursoIds.length > 0) await admin.from("aprendizaje_cursos").delete().in("id", cursoIds);
    for (const user of [manager, learner, otherLearner]) {
      if (user) await deleteTestUser(user.id);
    }
  }, 60_000);

  async function createCurso(status: "borrador" | "publicado", leccionCount = 2) {
    const { data: curso, error } = await manager.client
      .from("aprendizaje_cursos")
      .insert({ title: "Curso de prueba", category: "curso", created_by: manager.id })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoIds.push(curso.id);

    const { data: lecciones, error: leccionesError } = await manager.client
      .from("aprendizaje_lecciones")
      .insert(Array.from({ length: leccionCount }, (_, i) => ({ curso_id: curso.id, position: i, title: `Lección ${i + 1}` })))
      .select("id, position");
    if (leccionesError) throw new Error(`insert lecciones: ${leccionesError.message}`);
    // Sorted here rather than with .order(): ordering an insert's returned rows isn't reliable in PostgREST.
    lecciones?.sort((a, b) => a.position - b.position);

    if (status === "publicado") {
      const { error: publishError } = await manager.client
        .from("aprendizaje_cursos")
        .update({ status: "publicado" })
        .eq("id", curso.id);
      if (publishError) throw new Error(`publish: ${publishError.message}`);
    }
    return { cursoId: curso.id as string, leccionIds: (lecciones ?? []).map((l) => l.id as string) };
  }

  it("hides draft courses from learners and shows published ones", async () => {
    const draft = await createCurso("borrador");
    const published = await createCurso("publicado");

    const { data } = await learner.client.from("aprendizaje_cursos").select("id").in("id", [draft.cursoId, published.cursoId]);
    expect((data ?? []).map((r) => r.id)).toEqual([published.cursoId]);

    const { data: draftLessons } = await learner.client.from("aprendizaje_lecciones").select("id").eq("curso_id", draft.cursoId);
    expect(draftLessons).toEqual([]);
  });

  it("does not let a learner create courses", async () => {
    const { error } = await learner.client.from("aprendizaje_cursos").insert({ title: "Hack", category: "curso" });
    expect(error).not.toBeNull();
  });

  it("does not let a learner write progress directly", async () => {
    const { leccionIds } = await createCurso("publicado", 1);
    const { error } = await learner.client
      .from("aprendizaje_progreso_lecciones")
      .insert({ leccion_id: leccionIds[0], app_user_id: learner.id });
    expect(error).not.toBeNull();
  });

  it("marks lessons through the RPC and completes the course after the last one", async () => {
    const { cursoId, leccionIds } = await createCurso("publicado", 2);

    const first = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });
    expect(first.error).toBeNull();
    let { data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single();
    expect(inscripcion?.completed_at).toBeNull();

    const second = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[1] });
    expect(second.error).toBeNull();
    ({ data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single());
    expect(inscripcion?.completed_at).not.toBeNull();

    // Marking again is idempotent.
    const again = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[1] });
    expect(again.error).toBeNull();
  });

  it("rejects marking a lesson of a draft course", async () => {
    const { leccionIds } = await createCurso("borrador", 1);
    const { error } = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });
    expect(error?.message).toContain("El curso no está publicado");
  });

  it("keeps each learner's progress private", async () => {
    const { leccionIds } = await createCurso("publicado", 1);
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });

    const { data } = await otherLearner.client
      .from("aprendizaje_progreso_lecciones")
      .select("leccion_id")
      .eq("app_user_id", learner.id);
    expect(data).toEqual([]);

    const { data: managerView } = await manager.client
      .from("aprendizaje_progreso_lecciones")
      .select("leccion_id")
      .eq("app_user_id", learner.id)
      .eq("leccion_id", leccionIds[0]);
    expect(managerView).toHaveLength(1);
  });

  it("lets only managers reorder lessons, atomically", async () => {
    const { cursoId, leccionIds } = await createCurso("borrador", 3);
    const reversed = [...leccionIds].reverse();

    const denied = await learner.client.rpc("aprendizaje_reordenar_lecciones", { p_curso_id: cursoId, p_ids: reversed });
    expect(denied.error?.message).toContain("No autorizado");

    const ok = await manager.client.rpc("aprendizaje_reordenar_lecciones", { p_curso_id: cursoId, p_ids: reversed });
    expect(ok.error).toBeNull();
    const { data } = await manager.client
      .from("aprendizaje_lecciones")
      .select("id")
      .eq("curso_id", cursoId)
      .order("position");
    expect((data ?? []).map((r) => r.id)).toEqual(reversed);
  });
});
```

- [ ] **Step 2: Run**

Run: `bun x vitest run src/test/integration/aprendizajeRls.test.ts`
Expected: 7 passed. (Before Task 3 they fail with "relation … does not exist".)

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/aprendizajeRls.test.ts
git commit -m "test(aprendizaje): RLS and progress RPC integration tests"
```

---

### Task 5: Shared types and mapping helpers

**Files:**
- Create: `src/lib/aprendizaje/types.ts`
- Create: `src/lib/aprendizaje/mapCurso.ts`
- Test: `src/lib/aprendizaje/mapCurso.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type CursoCategory = "curso" | "historia";
export type CursoStatus = "borrador" | "publicado" | "archivado";

/** A file stored in SharePoint, referenced by Graph drive/item ids. */
export interface DriveFileRef {
  driveId: string;
  itemId: string;
}

export interface LeccionArchivo extends DriveFileRef {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
}

export interface Leccion {
  id: string;
  position: number;
  title: string;
  body: string | null;
  videoUrl: string | null;
  videoFile: DriveFileRef | null;
  archivos: LeccionArchivo[];
  completed: boolean;
}

export interface CursoDetail {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
  status: CursoStatus;
  cover: DriveFileRef | null;
  lecciones: Leccion[];
  completedAt: string | null;
}

export interface CatalogCurso {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
  cover: DriveFileRef | null;
  leccionCount: number;
  completedLecciones: number;
  completedAt: string | null;
}

export interface GestionCursoRow {
  id: string;
  title: string;
  category: CursoCategory;
  status: CursoStatus;
  leccionCount: number;
  updatedAt: string;
}

export const CATEGORY_LABELS: Record<CursoCategory, string> = {
  curso: "Cursos y tutoriales",
  historia: "Historia",
};

export const STATUS_LABELS: Record<CursoStatus, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  archivado: "Archivado",
};

/** Same look as the shadcn Input, for native <select>/<textarea> in the Aprendizaje forms. */
export const FIELD_CLASS_NAME =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** Permission-checked URL that redirects to the file's short-lived SharePoint download link. */
export function archivoUrl(ref: DriveFileRef): string {
  return `/api/aprendizaje/archivo/${encodeURIComponent(ref.driveId)}/${encodeURIComponent(ref.itemId)}`;
}
```

- [ ] **Step 2: Write the failing tests `mapCurso.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  firstPendingLeccionId,
  nextLeccionId,
  progressPercent,
  toCatalogCurso,
  toCursoDetail,
  toGestionCursoRow,
  type RawCurso,
} from "./mapCurso";

const RAW: RawCurso = {
  id: "c1",
  title: "Seguridad",
  description: "Curso básico",
  category: "curso",
  status: "publicado",
  cover_drive_id: "d1",
  cover_item_id: "i1",
  updated_at: "2026-11-25T10:00:00Z",
  aprendizaje_lecciones: [
    {
      id: "l2",
      position: 1,
      title: "Segunda",
      body: null,
      video_url: null,
      video_drive_id: "d2",
      video_item_id: "i2",
      aprendizaje_leccion_archivos: [
        { id: "a2", filename: "b.pdf", content_type: "application/pdf", size_bytes: 20, drive_id: "d", item_id: "b", position: 1 },
        { id: "a1", filename: "a.pdf", content_type: "application/pdf", size_bytes: 10, drive_id: "d", item_id: "a", position: 0 },
      ],
    },
    {
      id: "l1",
      position: 0,
      title: "Primera",
      body: "Hola",
      video_url: "https://youtu.be/abc123def45",
      video_drive_id: null,
      video_item_id: null,
      aprendizaje_leccion_archivos: null,
    },
  ],
};

describe("toCursoDetail", () => {
  it("sorts lessons and files by position and marks completed lessons", () => {
    const curso = toCursoDetail(RAW, new Set(["l1"]), null);

    expect(curso.cover).toEqual({ driveId: "d1", itemId: "i1" });
    expect(curso.lecciones.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(curso.lecciones[0]).toMatchObject({ completed: true, videoUrl: "https://youtu.be/abc123def45", videoFile: null, archivos: [] });
    expect(curso.lecciones[1].videoFile).toEqual({ driveId: "d2", itemId: "i2" });
    expect(curso.lecciones[1].archivos.map((a) => a.filename)).toEqual(["a.pdf", "b.pdf"]);
    expect(curso.lecciones[1].completed).toBe(false);
  });

  it("returns no cover when the ids are missing", () => {
    expect(toCursoDetail({ ...RAW, cover_drive_id: null, cover_item_id: null }, new Set(), null).cover).toBeNull();
  });
});

describe("toCatalogCurso", () => {
  it("counts lessons and completed lessons", () => {
    expect(toCatalogCurso(RAW, new Set(["l2", "other"]), "2026-11-25T12:00:00Z")).toMatchObject({
      leccionCount: 2,
      completedLecciones: 1,
      completedAt: "2026-11-25T12:00:00Z",
    });
  });
});

describe("toGestionCursoRow", () => {
  it("maps status, lesson count and updatedAt", () => {
    expect(toGestionCursoRow(RAW)).toEqual({
      id: "c1",
      title: "Seguridad",
      category: "curso",
      status: "publicado",
      leccionCount: 2,
      updatedAt: "2026-11-25T10:00:00Z",
    });
  });
});

describe("progress helpers", () => {
  it("progressPercent rounds and handles empty courses", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(3, 3)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });

  const lecciones = [
    { id: "a", completed: true },
    { id: "b", completed: false },
    { id: "c", completed: false },
  ];

  it("firstPendingLeccionId picks the first incomplete lesson, else the first one", () => {
    expect(firstPendingLeccionId(lecciones)).toBe("b");
    expect(firstPendingLeccionId(lecciones.map((l) => ({ ...l, completed: true })))).toBe("a");
    expect(firstPendingLeccionId([])).toBeNull();
  });

  it("nextLeccionId returns the following lesson or null at the end", () => {
    expect(nextLeccionId(lecciones, "a")).toBe("b");
    expect(nextLeccionId(lecciones, "c")).toBeNull();
    expect(nextLeccionId(lecciones, "missing")).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun x vitest run src/lib/aprendizaje/mapCurso.test.ts`
Expected: FAIL (cannot resolve `./mapCurso`).

- [ ] **Step 4: Write `mapCurso.ts`**

```ts
import type {
  CatalogCurso,
  CursoCategory,
  CursoDetail,
  CursoStatus,
  DriveFileRef,
  GestionCursoRow,
} from "./types";

// Row shapes as returned by Supabase's nested selects (snake_case).
export interface RawArchivo {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number | null;
  drive_id: string;
  item_id: string;
  position: number;
}

export interface RawLeccion {
  id: string;
  position: number;
  title: string;
  body: string | null;
  video_url: string | null;
  video_drive_id: string | null;
  video_item_id: string | null;
  aprendizaje_leccion_archivos?: RawArchivo[] | null;
}

export interface RawCurso {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
  status: CursoStatus;
  cover_drive_id: string | null;
  cover_item_id: string | null;
  updated_at?: string;
  // The catalog/list queries only select lesson ids; the detail query selects everything.
  aprendizaje_lecciones?: (Pick<RawLeccion, "id"> & Partial<RawLeccion>)[] | null;
}

function fileRef(driveId: string | null, itemId: string | null): DriveFileRef | null {
  return driveId && itemId ? { driveId, itemId } : null;
}

export function toCursoDetail(
  raw: RawCurso,
  completedLeccionIds: ReadonlySet<string>,
  completedAt: string | null,
): CursoDetail {
  const lecciones = [...((raw.aprendizaje_lecciones ?? []) as RawLeccion[])]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      id: l.id,
      position: l.position,
      title: l.title,
      body: l.body,
      videoUrl: l.video_url,
      videoFile: fileRef(l.video_drive_id, l.video_item_id),
      archivos: [...(l.aprendizaje_leccion_archivos ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.content_type,
          sizeBytes: a.size_bytes,
          driveId: a.drive_id,
          itemId: a.item_id,
        })),
      completed: completedLeccionIds.has(l.id),
    }));

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    category: raw.category,
    status: raw.status,
    cover: fileRef(raw.cover_drive_id, raw.cover_item_id),
    lecciones,
    completedAt,
  };
}

export function toCatalogCurso(
  raw: RawCurso,
  completedLeccionIds: ReadonlySet<string>,
  completedAt: string | null,
): CatalogCurso {
  const leccionIds = (raw.aprendizaje_lecciones ?? []).map((l) => l.id);
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    category: raw.category,
    cover: fileRef(raw.cover_drive_id, raw.cover_item_id),
    leccionCount: leccionIds.length,
    completedLecciones: leccionIds.filter((id) => completedLeccionIds.has(id)).length,
    completedAt,
  };
}

export function toGestionCursoRow(raw: RawCurso): GestionCursoRow {
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    status: raw.status,
    leccionCount: (raw.aprendizaje_lecciones ?? []).length,
    updatedAt: raw.updated_at ?? "",
  };
}

export function progressPercent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.round((done / total) * 100);
}

export function firstPendingLeccionId(lecciones: { id: string; completed: boolean }[]): string | null {
  return (lecciones.find((l) => !l.completed) ?? lecciones[0])?.id ?? null;
}

export function nextLeccionId(lecciones: { id: string }[], currentId: string): string | null {
  const index = lecciones.findIndex((l) => l.id === currentId);
  return index >= 0 && index < lecciones.length - 1 ? lecciones[index + 1].id : null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun x vitest run src/lib/aprendizaje/mapCurso.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aprendizaje/types.ts src/lib/aprendizaje/mapCurso.ts src/lib/aprendizaje/mapCurso.test.ts
git commit -m "feat(aprendizaje): domain types and row mapping helpers"
```

---

### Task 6: Video link parsing

**Files:**
- Create: `src/lib/aprendizaje/videoEmbed.ts`
- Test: `src/lib/aprendizaje/videoEmbed.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { toVideoEmbed } from "./videoEmbed";

const yt = (id: string) => ({ kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` });

describe("toVideoEmbed", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("embeds YouTube link %s", (url, id) => {
    expect(toVideoEmbed(url)).toEqual(yt(id));
  });

  it.each(["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"])("embeds Vimeo link %s", (url) => {
    expect(toVideoEmbed(url)).toEqual({ kind: "iframe", provider: "vimeo", src: "https://player.vimeo.com/video/123456789" });
  });

  it("falls back to an external link for other providers (Stream, SharePoint...)", () => {
    const url = "https://empresa.sharepoint.com/:v:/s/sitio/EabcDEF";
    expect(toVideoEmbed(url)).toEqual({ kind: "link", href: url });
  });

  it("falls back to a link for a YouTube URL without a video id", () => {
    expect(toVideoEmbed("https://www.youtube.com/@canal")).toEqual({ kind: "link", href: "https://www.youtube.com/@canal" });
  });

  it.each(["", "no es un enlace", "javascript:alert(1)", "ftp://example.com/video.mp4"])("rejects %j", (url) => {
    expect(toVideoEmbed(url)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun x vitest run src/lib/aprendizaje/videoEmbed.test.ts`
Expected: FAIL (cannot resolve `./videoEmbed`).

- [ ] **Step 3: Implement**

```ts
export type VideoEmbed =
  | { kind: "iframe"; provider: "youtube" | "vimeo"; src: string }
  | { kind: "link"; href: string };

const YOUTUBE_ID = /^[\w-]{6,20}$/;

function youtube(id: string | null | undefined): VideoEmbed | null {
  return id && YOUTUBE_ID.test(id)
    ? { kind: "iframe", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` }
    : null;
}

/**
 * Turns a lesson's video link into something renderable: YouTube/Vimeo
 * become embeddable iframe URLs; any other http(s) link (Microsoft Stream,
 * SharePoint, etc.) is shown as an "open video" link. Returns null for
 * anything that isn't an http(s) URL, which the editor rejects.
 */
export function toVideoEmbed(rawUrl: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const link: VideoEmbed = { kind: "link", href: url.toString() };

  if (host === "youtu.be") return youtube(url.pathname.split("/")[1]) ?? link;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return youtube(url.searchParams.get("v")) ?? link;
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
    return youtube(match?.[1]) ?? link;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)/);
    return match ? { kind: "iframe", provider: "vimeo", src: `https://player.vimeo.com/video/${match[1]}` } : link;
  }
  return link;
}
```

Note: `new URL("https://empresa.sharepoint.com/:v:/s/sitio/EabcDEF").toString()` returns the same string, so the fallback test compares equal.

- [ ] **Step 4: Run to verify it passes**

Run: `bun x vitest run src/lib/aprendizaje/videoEmbed.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aprendizaje/videoEmbed.ts src/lib/aprendizaje/videoEmbed.test.ts
git commit -m "feat(aprendizaje): parse YouTube/Vimeo links into embeds"
```

---

### Task 7: Upload validation and chunked upload

**Files:**
- Create: `src/lib/aprendizaje/files.ts`
- Create: `src/lib/aprendizaje/chunkedUpload.ts`
- Test: `src/lib/aprendizaje/files.test.ts`
- Test: `src/lib/aprendizaje/chunkedUpload.test.ts`

- [ ] **Step 1: Write the failing tests `files.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, MAX_VIDEO_BYTES, validateUpload } from "./files";

describe("validateUpload", () => {
  it("accepts valid files", () => {
    expect(validateUpload("video", { size: 10, type: "video/mp4" })).toBeNull();
    expect(validateUpload("portada", { size: 10, type: "image/png" })).toBeNull();
    expect(validateUpload("archivo", { size: 10, type: "application/pdf" })).toBeNull();
    expect(validateUpload("archivo", { size: 10, type: "" })).toBeNull();
  });

  it.each<[Parameters<typeof validateUpload>[0], { size: number; type: string }, string]>([
    ["archivo", { size: 0, type: "application/pdf" }, "El archivo está vacío."],
    ["video", { size: 10, type: "video/x-msvideo" }, "El video debe ser MP4, WebM o MOV."],
    ["video", { size: MAX_VIDEO_BYTES + 1, type: "video/mp4" }, "El video no puede pesar más de 2 GB."],
    ["portada", { size: 10, type: "application/pdf" }, "La portada debe ser una imagen JPG, PNG, WebP o GIF."],
    ["portada", { size: MAX_FILE_BYTES + 1, type: "image/png" }, "El archivo no puede pesar más de 100 MB."],
    ["archivo", { size: MAX_FILE_BYTES + 1, type: "application/pdf" }, "El archivo no puede pesar más de 100 MB."],
  ])("rejects %s %j", (kind, file, error) => {
    expect(validateUpload(kind, file)).toBe(error);
  });
});
```

- [ ] **Step 2: Write the failing tests `chunkedUpload.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { chunkRanges, uploadFileInChunks, UPLOAD_CHUNK_BYTES } from "./chunkedUpload";

describe("chunkRanges", () => {
  it("uses 5 MiB chunks, a multiple of 320 KiB as Graph requires", () => {
    expect(UPLOAD_CHUNK_BYTES).toBe(5 * 1024 * 1024);
    expect(UPLOAD_CHUNK_BYTES % (320 * 1024)).toBe(0);
  });

  it("splits into inclusive byte ranges", () => {
    expect(chunkRanges(25, 10)).toEqual([
      { start: 0, end: 9 },
      { start: 10, end: 19 },
      { start: 20, end: 24 },
    ]);
    expect(chunkRanges(10, 10)).toEqual([{ start: 0, end: 9 }]);
    expect(chunkRanges(0, 10)).toEqual([]);
  });
});

describe("uploadFileInChunks", () => {
  function response(status: number, body: unknown = {}) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  it("PUTs each chunk with Content-Range and returns the created drive item", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(202))
      .mockResolvedValueOnce(response(202))
      .mockResolvedValueOnce(response(201, { id: "item-1", parentReference: { driveId: "drive-1" } }));
    const progress: number[] = [];

    const result = await uploadFileInChunks(new Blob(["x".repeat(25)]), "https://upload.example/session", {
      chunkBytes: 10,
      fetchImpl,
      onProgress: (f) => progress.push(f),
    });

    expect(result).toEqual({ driveId: "drive-1", itemId: "item-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [url, init] = fetchImpl.mock.calls[2];
    expect(url).toBe("https://upload.example/session");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Range"]).toBe("bytes 20-24/25");
    expect((init.body as Blob).size).toBe(5);
    expect(progress).toEqual([0.4, 0.8, 1]);
  });

  it("throws when a chunk fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(500));
    await expect(
      uploadFileInChunks(new Blob(["abc"]), "https://upload.example/session", { chunkBytes: 10, fetchImpl }),
    ).rejects.toThrow("La subida falló (500)");
  });

  it("throws when the last chunk does not return the drive item", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(202));
    await expect(
      uploadFileInChunks(new Blob(["abc"]), "https://upload.example/session", { chunkBytes: 10, fetchImpl }),
    ).rejects.toThrow("La subida terminó sin confirmar el archivo");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `bun x vitest run src/lib/aprendizaje/files.test.ts src/lib/aprendizaje/chunkedUpload.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `files.ts`**

```ts
export type UploadKind = "video" | "archivo" | "portada";

export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
export const MAX_FILE_BYTES = 100 * 1024 ** 2;

export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** `accept` attribute for the file input of each kind. */
export const UPLOAD_ACCEPT: Record<UploadKind, string> = {
  video: VIDEO_TYPES.join(","),
  portada: IMAGE_TYPES.join(","),
  archivo: "",
};

/** Shared by the browser (before uploading) and the server action that opens the upload session. */
export function validateUpload(kind: UploadKind, file: { size: number; type: string }): string | null {
  if (file.size <= 0) return "El archivo está vacío.";
  if (kind === "video") {
    if (!VIDEO_TYPES.includes(file.type)) return "El video debe ser MP4, WebM o MOV.";
    if (file.size > MAX_VIDEO_BYTES) return "El video no puede pesar más de 2 GB.";
    return null;
  }
  if (kind === "portada" && !IMAGE_TYPES.includes(file.type)) {
    return "La portada debe ser una imagen JPG, PNG, WebP o GIF.";
  }
  if (file.size > MAX_FILE_BYTES) return "El archivo no puede pesar más de 100 MB.";
  return null;
}
```

- [ ] **Step 5: Implement `chunkedUpload.ts`**

```ts
// Graph upload sessions need every chunk except the last to be a multiple
// of 320 KiB; 5 MiB (16 x 320 KiB) is Microsoft's recommended size.
export const UPLOAD_CHUNK_BYTES = 16 * 320 * 1024;

export function chunkRanges(totalBytes: number, chunkBytes = UPLOAD_CHUNK_BYTES): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (let start = 0; start < totalBytes; start += chunkBytes) {
    ranges.push({ start, end: Math.min(start + chunkBytes, totalBytes) - 1 });
  }
  return ranges;
}

interface GraphDriveItem {
  id: string;
  parentReference: { driveId: string };
}

/**
 * Uploads a file to a Graph upload session from the browser. The uploadUrl
 * is pre-authenticated, so no Authorization header is sent (Graph rejects
 * it). Intermediate chunks answer 202; the last one answers 200/201 with
 * the created drive item.
 */
export async function uploadFileInChunks(
  file: Blob,
  uploadUrl: string,
  options: { onProgress?: (fraction: number) => void; fetchImpl?: typeof fetch; chunkBytes?: number } = {},
): Promise<{ driveId: string; itemId: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const total = file.size;

  for (const { start, end } of chunkRanges(total, options.chunkBytes)) {
    const res = await fetchImpl(uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end}/${total}` },
      body: file.slice(start, end + 1),
    });
    if (!res.ok) throw new Error(`La subida falló (${res.status})`);
    options.onProgress?.((end + 1) / total);
    if (res.status === 200 || res.status === 201) {
      const item = (await res.json()) as GraphDriveItem;
      return { driveId: item.parentReference.driveId, itemId: item.id };
    }
  }
  throw new Error("La subida terminó sin confirmar el archivo");
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `bun x vitest run src/lib/aprendizaje/files.test.ts src/lib/aprendizaje/chunkedUpload.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/aprendizaje/files.ts src/lib/aprendizaje/files.test.ts src/lib/aprendizaje/chunkedUpload.ts src/lib/aprendizaje/chunkedUpload.test.ts
git commit -m "feat(aprendizaje): upload validation and chunked Graph upload"
```

---

### Task 8: SharePoint upload session + CORS check

**Files:**
- Modify: `src/lib/sharepoint.ts` (append after `uploadToSharePoint`)

- [ ] **Step 1: Add `createSharePointUploadSession`**

```ts
interface GraphUploadSessionResponse {
  uploadUrl: string;
  expirationDateTime: string;
}

/**
 * Opens a Graph resumable upload session for a (possibly large) file. The
 * returned uploadUrl is pre-authenticated: the browser PUTs chunks straight
 * to it (see src/lib/aprendizaje/chunkedUpload.ts), so big videos never
 * pass through a Vercel function, which caps request bodies at ~4.5 MB.
 */
export async function createSharePointUploadSession(
  folder: string,
  filename: string,
): Promise<{ uploadUrl: string; expiresAt: string }> {
  const accessToken = await getGraphAccessToken();
  const siteId = await getSiteId(accessToken);

  const safeName = filename.replace(/[\\/:*?"<>|#%]/g, "_");
  const path = `${folder}/${crypto.randomUUID()}-${encodeURIComponent(safeName)}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${path}:/createUploadSession`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    },
  );
  if (!res.ok) {
    throw new Error(`No se pudo iniciar la subida a SharePoint: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphUploadSessionResponse;
  return { uploadUrl: data.uploadUrl, expiresAt: data.expirationDateTime };
}
```

- [ ] **Step 2: Verify the upload URL accepts browser PUTs (CORS)**

Write this throwaway script in the session scratchpad (NOT in the repo), e.g. `<scratchpad>/cors-check.ts`:

```ts
// Run from the repo root: bun --env-file=.env.local <scratchpad>/cors-check.ts
const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.ONEDRIVE_TENANT_ID}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.ONEDRIVE_CLIENT_ID!,
    client_secret: process.env.ONEDRIVE_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  }),
});
const { access_token } = await tokenRes.json();
const site = new URL(process.env.SHAREPOINT_SITE_URL!);
const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.hostname}:${site.pathname}`, {
  headers: { Authorization: `Bearer ${access_token}` },
});
const { id: siteId } = await siteRes.json();
const sessionRes = await fetch(
  `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/aprendizaje/cors-check.txt:/createUploadSession`,
  { method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" }, body: "{}" },
);
const { uploadUrl } = await sessionRes.json();
const preflight = await fetch(uploadUrl, {
  method: "OPTIONS",
  headers: {
    Origin: "https://gente.sanchezbusinesscorp.com",
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": "content-range",
  },
});
console.log("preflight", preflight.status);
console.log("allow-origin", preflight.headers.get("access-control-allow-origin"));
console.log("allow-methods", preflight.headers.get("access-control-allow-methods"));
console.log("allow-headers", preflight.headers.get("access-control-allow-headers"));
await fetch(uploadUrl, { method: "DELETE" }); // cancel the session, nothing is created
```

Expected: `allow-origin` is `*` or echoes the origin, and `allow-methods`/`allow-headers` cover `PUT`/`content-range`. **If it does not**, stop and report: the fallback is an API route that forwards ≤3.75 MiB chunks (12 × 320 KiB) to the upload URL server-side, which requires changing `UPLOAD_CHUNK_BYTES` and pointing `uploadFileInChunks` at that route. Do not proceed with the UI tasks until this is settled.

- [ ] **Step 3: Typecheck and commit**

Run: `bun x tsc --noEmit -p .` — Expected: no errors.

```bash
git add src/lib/sharepoint.ts
git commit -m "feat(sharepoint): resumable upload sessions for large files"
```

---

### Task 9: File proxy API route

**Files:**
- Create: `src/app/api/aprendizaje/archivo/[driveId]/[itemId]/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";

// Redirects to a fresh, short-lived Graph download URL for a file that
// belongs to something the caller can see. The lookups use the
// request-scoped client, so the same RLS that hides draft courses from
// learners also hides their videos/files - ids alone aren't enough.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ driveId: string; itemId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { driveId, itemId } = await params;

  const [archivo, video, cover] = await Promise.all([
    supabase.from("aprendizaje_leccion_archivos").select("id").eq("drive_id", driveId).eq("item_id", itemId).limit(1),
    supabase.from("aprendizaje_lecciones").select("id").eq("video_drive_id", driveId).eq("video_item_id", itemId).limit(1),
    supabase.from("aprendizaje_cursos").select("id").eq("cover_drive_id", driveId).eq("cover_item_id", itemId).limit(1),
  ]);
  const visible = [archivo, video, cover].some((r) => (r.data?.length ?? 0) > 0);
  if (!visible) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  try {
    return NextResponse.redirect(await getSharePointDownloadUrl(driveId, itemId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo obtener el archivo" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Typecheck, lint and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/api/aprendizaje"` — Expected: no errors.

```bash
git add "src/app/api/aprendizaje/archivo/[driveId]/[itemId]/route.ts"
git commit -m "feat(aprendizaje): permission-checked SharePoint file route"
```

---

### Task 10: Learner server actions

**Files:**
- Create: `src/app/(app)/aprendizaje/actions.ts`

- [ ] **Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toCatalogCurso, toCursoDetail, type RawCurso } from "@/lib/aprendizaje/mapCurso";
import type { CatalogCurso, CursoDetail } from "@/lib/aprendizaje/types";

const CURSO_DETAIL_SELECT =
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, " +
  "aprendizaje_lecciones(id, position, title, body, video_url, video_drive_id, video_item_id, " +
  "aprendizaje_leccion_archivos(id, filename, content_type, size_bytes, drive_id, item_id, position))";

export async function aprendizajeFlags(): Promise<{ canView: boolean; canManage: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" });
  const canManage = Boolean(data?.[0]?.can_manage);
  return { canView: Boolean(data?.[0]?.can_view) || canManage, canManage };
}

async function myProgress(): Promise<{ leccionIds: Set<string>; completedByCurso: Map<string, string | null> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { leccionIds: new Set(), completedByCurso: new Map() };

  const [{ data: progreso }, { data: inscripciones }] = await Promise.all([
    supabase.from("aprendizaje_progreso_lecciones").select("leccion_id").eq("app_user_id", user.id),
    supabase.from("aprendizaje_inscripciones").select("curso_id, completed_at").eq("app_user_id", user.id),
  ]);
  return {
    leccionIds: new Set((progreso ?? []).map((p) => p.leccion_id as string)),
    completedByCurso: new Map((inscripciones ?? []).map((i) => [i.curso_id as string, i.completed_at as string | null])),
  };
}

/** Published courses only - managers see drafts in Gestión, not in the catalog. */
export async function listCatalog(): Promise<CatalogCurso[]> {
  const supabase = await createClient();
  const [{ data }, progress] = await Promise.all([
    supabase
      .from("aprendizaje_cursos")
      .select("id, title, description, category, status, cover_drive_id, cover_item_id, aprendizaje_lecciones(id)")
      .eq("status", "publicado")
      .order("created_at", { ascending: false }),
    myProgress(),
  ]);
  return ((data ?? []) as unknown as RawCurso[]).map((raw) =>
    toCatalogCurso(raw, progress.leccionIds, progress.completedByCurso.get(raw.id) ?? null),
  );
}

export async function getCurso(cursoId: string): Promise<CursoDetail | null> {
  const supabase = await createClient();
  const [{ data }, progress] = await Promise.all([
    supabase.from("aprendizaje_cursos").select(CURSO_DETAIL_SELECT).eq("id", cursoId).maybeSingle(),
    myProgress(),
  ]);
  if (!data) return null;
  return toCursoDetail(data as unknown as RawCurso, progress.leccionIds, progress.completedByCurso.get(cursoId) ?? null);
}

export async function marcarLeccionVista(leccionId: string, cursoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionId });
  if (error) return { error: error.message };
  revalidatePath(`/aprendizaje/${cursoId}`);
  revalidatePath("/aprendizaje");
  return {};
}
```

- [ ] **Step 2: Typecheck, lint and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/actions.ts"` — Expected: no errors.

```bash
git add "src/app/(app)/aprendizaje/actions.ts"
git commit -m "feat(aprendizaje): learner server actions (catalog, course, mark lesson)"
```

---

### Task 11: Manager server actions

**Files:**
- Create: `src/app/(app)/aprendizaje/gestion/actions.ts`

- [ ] **Step 1: Write the actions**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSharePointUploadSession } from "@/lib/sharepoint";
import { validateUpload, type UploadKind } from "@/lib/aprendizaje/files";
import { toCursoDetail, toGestionCursoRow, type RawCurso } from "@/lib/aprendizaje/mapCurso";
import type { CursoCategory, CursoDetail, CursoStatus, DriveFileRef, GestionCursoRow } from "@/lib/aprendizaje/types";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";

interface ActionResult {
  error?: string;
}

const CURSO_DETAIL_SELECT =
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, " +
  "aprendizaje_lecciones(id, position, title, body, video_url, video_drive_id, video_item_id, " +
  "aprendizaje_leccion_archivos(id, filename, content_type, size_bytes, drive_id, item_id, position))";

const CATEGORIES: CursoCategory[] = ["curso", "historia"];
const STATUSES: CursoStatus[] = ["borrador", "publicado", "archivado"];

/** Every manager action re-checks can_manage server-side; RLS enforces it again on each write. */
async function managerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "aprendizaje" });
  if (!data?.[0]?.can_manage) return null;
  return { supabase, userId: user.id };
}

function revalidateCurso(cursoId: string) {
  revalidatePath(`/aprendizaje/gestion/${cursoId}`);
  revalidatePath("/aprendizaje/gestion");
  revalidatePath(`/aprendizaje/${cursoId}`);
  revalidatePath("/aprendizaje");
}

export async function listCursosGestion(): Promise<GestionCursoRow[]> {
  const ctx = await managerClient();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from("aprendizaje_cursos")
    .select("id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, aprendizaje_lecciones(id)")
    .order("updated_at", { ascending: false });
  return ((data ?? []) as unknown as RawCurso[]).map(toGestionCursoRow);
}

export async function getCursoGestion(cursoId: string): Promise<CursoDetail | null> {
  const ctx = await managerClient();
  if (!ctx) return null;
  const { data } = await ctx.supabase.from("aprendizaje_cursos").select(CURSO_DETAIL_SELECT).eq("id", cursoId).maybeSingle();
  return data ? toCursoDetail(data as unknown as RawCurso, new Set(), null) : null;
}

export async function createCurso(input: {
  title: string;
  description: string;
  category: CursoCategory;
}): Promise<ActionResult & { id?: string }> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio." };
  if (!CATEGORIES.includes(input.category)) return { error: "Categoría inválida." };

  const { data, error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .insert({
      title: input.title.trim(),
      description: input.description.trim() || null,
      category: input.category,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear el curso." };
  revalidatePath("/aprendizaje/gestion");
  return { id: data.id };
}

export async function updateCurso(
  cursoId: string,
  input: { title: string; description: string; category: CursoCategory },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título es obligatorio." };
  if (!CATEGORIES.includes(input.category)) return { error: "Categoría inválida." };

  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({ title: input.title.trim(), description: input.description.trim() || null, category: input.category })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function setCursoStatus(cursoId: string, status: CursoStatus): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!STATUSES.includes(status)) return { error: "Estado inválido." };

  if (status === "publicado") {
    const { count } = await ctx.supabase
      .from("aprendizaje_lecciones")
      .select("id", { count: "exact", head: true })
      .eq("curso_id", cursoId);
    if (!count) return { error: "Agrega al menos una lección antes de publicar." };
  }

  const { error } = await ctx.supabase.from("aprendizaje_cursos").update({ status }).eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Only drafts can be deleted; published/archived courses may have progress worth keeping. */
export async function deleteCurso(cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { data: curso } = await ctx.supabase.from("aprendizaje_cursos").select("status").eq("id", cursoId).maybeSingle();
  if (!curso) return { error: "Curso no encontrado." };
  if (curso.status !== "borrador") return { error: "Solo se pueden eliminar cursos en borrador. Archívalo en su lugar." };

  const { error } = await ctx.supabase.from("aprendizaje_cursos").delete().eq("id", cursoId);
  if (error) return { error: error.message };
  revalidatePath("/aprendizaje/gestion");
  return {};
}

export async function setCursoCover(cursoId: string, cover: DriveFileRef | null): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({ cover_drive_id: cover?.driveId ?? null, cover_item_id: cover?.itemId ?? null })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function createLeccion(cursoId: string, title: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!title.trim()) return { error: "El título de la lección es obligatorio." };

  const { data: last } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .select("position")
    .eq("curso_id", cursoId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .insert({ curso_id: cursoId, title: title.trim(), position: (last?.position ?? -1) + 1 });
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function updateLeccion(
  leccionId: string,
  cursoId: string,
  input: { title: string; body: string; videoUrl: string },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  if (!input.title.trim()) return { error: "El título de la lección es obligatorio." };
  const videoUrl = input.videoUrl.trim();
  if (videoUrl && !toVideoEmbed(videoUrl)) return { error: "El enlace del video no es válido." };

  // A link replaces an uploaded video (the table allows only one of them).
  const videoPatch = videoUrl ? { video_url: videoUrl, video_drive_id: null, video_item_id: null } : { video_url: null };
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .update({ title: input.title.trim(), body: input.body.trim() || null, ...videoPatch })
    .eq("id", leccionId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function setLeccionVideoFile(
  leccionId: string,
  cursoId: string,
  file: DriveFileRef | null,
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase
    .from("aprendizaje_lecciones")
    .update({ video_url: null, video_drive_id: file?.driveId ?? null, video_item_id: file?.itemId ?? null })
    .eq("id", leccionId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function deleteLeccion(leccionId: string, cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_lecciones").delete().eq("id", leccionId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function reorderLecciones(cursoId: string, orderedIds: string[]): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.rpc("aprendizaje_reordenar_lecciones", { p_curso_id: cursoId, p_ids: orderedIds });
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function addLeccionArchivo(
  leccionId: string,
  cursoId: string,
  file: DriveFileRef & { filename: string; contentType: string; sizeBytes: number },
): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { count } = await ctx.supabase
    .from("aprendizaje_leccion_archivos")
    .select("id", { count: "exact", head: true })
    .eq("leccion_id", leccionId);
  const { error } = await ctx.supabase.from("aprendizaje_leccion_archivos").insert({
    leccion_id: leccionId,
    filename: file.filename,
    content_type: file.contentType || "application/octet-stream",
    size_bytes: file.sizeBytes,
    drive_id: file.driveId,
    item_id: file.itemId,
    position: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function removeLeccionArchivo(archivoId: string, cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_leccion_archivos").delete().eq("id", archivoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Opens a Graph upload session; the browser then uploads the bytes itself. */
export async function startUpload(
  kind: UploadKind,
  file: { name: string; size: number; type: string },
): Promise<{ uploadUrl?: string; error?: string }> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const invalid = validateUpload(kind, file);
  if (invalid) return { error: invalid };
  try {
    const { uploadUrl } = await createSharePointUploadSession("aprendizaje", file.name);
    return { uploadUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo iniciar la subida." };
  }
}
```

- [ ] **Step 2: Typecheck, lint and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/gestion/actions.ts"` — Expected: no errors.

```bash
git add "src/app/(app)/aprendizaje/gestion/actions.ts"
git commit -m "feat(aprendizaje): manager server actions (courses, lessons, files, uploads)"
```

---

### Task 12: Menu entry

**Files:**
- Modify: `src/app/(app)/layout.tsx` (add prop to `<AppShell>`)
- Modify: `src/app/(app)/Sidebar.tsx` (import, prop, link)

- [ ] **Step 1: `layout.tsx`** — after the `canManageServiciosGenerales={…}` line add:

```tsx
      canViewAprendizaje={Boolean(
        permissions.get("aprendizaje")?.can_view || permissions.get("aprendizaje")?.can_manage,
      )}
```

- [ ] **Step 2: `Sidebar.tsx`**
  1. Add `GraduationCap,` to the `lucide-react` import list (alphabetical, after `FileText,`).
  2. In the destructured props add `canViewAprendizaje,` after `canManageServiciosGenerales,`, and in the props type add `canViewAprendizaje: boolean;` after `canManageServiciosGenerales: boolean;`.
  3. In `mainLinksAfterMaintenance`, right after the `"/planificacion"` entry, add:

```tsx
    ...(canViewAprendizaje ? [{ href: "/aprendizaje", label: "Aprendizaje", icon: GraduationCap }] : []),
```

- [ ] **Step 3: Typecheck, lint and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"` — Expected: no errors.

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"
git commit -m "feat(aprendizaje): sidebar entry gated by the aprendizaje permission"
```

---

### Task 13: Catalog page

**Files:**
- Create: `src/app/(app)/aprendizaje/CursoCard.tsx`
- Create: `src/app/(app)/aprendizaje/page.tsx`

- [ ] **Step 1: `CursoCard.tsx`**

```tsx
import { BookOpen, CheckCircle2, Landmark } from "lucide-react";
import { progressPercent } from "@/lib/aprendizaje/mapCurso";
import { archivoUrl, type CatalogCurso } from "@/lib/aprendizaje/types";

export function CursoCard({ curso }: { curso: CatalogCurso }) {
  const percent = progressPercent(curso.completedLecciones, curso.leccionCount);
  const Icon = curso.category === "historia" ? Landmark : BookOpen;

  return (
    <a
      href={`/aprendizaje/${curso.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-video bg-[#04B1AF]/10">
        {curso.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL; next/image can't optimize it
          <img src={archivoUrl(curso.cover)} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-[#04B1AF]">
            <Icon className="size-10" />
          </div>
        )}
        {curso.completedAt && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
            <CheckCircle2 className="size-3.5" />
            Completado
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold text-foreground group-hover:text-[#04B1AF]">{curso.title}</h3>
        {curso.description && <p className="line-clamp-2 text-sm text-muted-foreground">{curso.description}</p>}
        <div className="mt-auto space-y-1 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {curso.completedLecciones}/{curso.leccionCount} lecciones
            </span>
            <span>{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { CATEGORY_LABELS, type CursoCategory } from "@/lib/aprendizaje/types";
import { aprendizajeFlags, listCatalog } from "./actions";
import { CursoCard } from "./CursoCard";

const CATEGORIES: CursoCategory[] = ["curso", "historia"];

export default async function AprendizajePage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { categoria } = await searchParams;
  const category: CursoCategory = categoria === "historia" ? "historia" : "curso";
  const cursos = (await listCatalog()).filter((c) => c.category === category);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Aprendizaje</h1>
            <p className="text-sm text-muted-foreground">Cursos, tutoriales y contenidos de historia.</p>
          </div>
          {flags.canManage && (
            <a
              href="/aprendizaje/gestion"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted"
            >
              <Settings2 className="size-4" />
              Gestión
            </a>
          )}
        </div>

        <nav className="flex gap-1 border-b">
          {CATEGORIES.map((c) => (
            <a
              key={c}
              href={c === "curso" ? "/aprendizaje" : `/aprendizaje?categoria=${c}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                c === category
                  ? "border-[#04B1AF] text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </a>
          ))}
        </nav>

        {cursos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay contenidos publicados aquí.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cursos.map((curso) => (
              <CursoCard key={curso.id} curso={curso} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/page.tsx" "src/app/(app)/aprendizaje/CursoCard.tsx"` — Expected: no errors. (If the eslint-disable comment is reported as unused because the rule isn't enabled, remove that comment line.)

```bash
git add "src/app/(app)/aprendizaje/page.tsx" "src/app/(app)/aprendizaje/CursoCard.tsx"
git commit -m "feat(aprendizaje): catalog page with Cursos/Historia tabs"
```

---

### Task 14: Course viewer

**Files:**
- Create: `src/app/(app)/aprendizaje/[cursoId]/LeccionContent.tsx`
- Create: `src/app/(app)/aprendizaje/[cursoId]/CursoViewer.tsx`
- Create: `src/app/(app)/aprendizaje/[cursoId]/page.tsx`
- Test: `src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx`

- [ ] **Step 1: `LeccionContent.tsx`**

```tsx
import { Download, ExternalLink } from "lucide-react";
import { archivoUrl, type Leccion } from "@/lib/aprendizaje/types";
import { toVideoEmbed } from "@/lib/aprendizaje/videoEmbed";

export function LeccionContent({ leccion }: { leccion: Leccion }) {
  const embed = leccion.videoUrl ? toVideoEmbed(leccion.videoUrl) : null;
  const images = leccion.archivos.filter((a) => a.contentType.startsWith("image/"));
  const documents = leccion.archivos.filter((a) => !a.contentType.startsWith("image/"));

  return (
    <div className="space-y-5">
      {leccion.videoFile && (
        <video
          controls
          preload="metadata"
          src={archivoUrl(leccion.videoFile)}
          className="aspect-video w-full rounded-xl bg-black"
        />
      )}
      {embed?.kind === "iframe" && (
        <iframe
          src={embed.src}
          title={leccion.title}
          className="aspect-video w-full rounded-xl"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      )}
      {embed?.kind === "link" && (
        <a
          href={embed.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <ExternalLink className="size-4" />
          Abrir video
        </a>
      )}

      {leccion.body && <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">{leccion.body}</div>}

      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
            <img key={img.id} src={archivoUrl(img)} alt={img.filename} className="w-full rounded-lg border" />
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Guías y materiales</h3>
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id}>
                <a
                  href={archivoUrl(doc)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-[#04B1AF] hover:underline"
                >
                  <Download className="size-4" />
                  {doc.filename}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the failing component test `CursoViewer.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const marcarLeccionVista = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../actions", () => ({
  marcarLeccionVista: (leccionId: string, cursoId: string) => marcarLeccionVista(leccionId, cursoId),
}));

const { CursoViewer } = await import("./CursoViewer");

function leccion(id: string, title: string, completed: boolean) {
  return { id, position: 0, title, body: `Contenido de ${title}`, videoUrl: null, videoFile: null, archivos: [], completed };
}

const CURSO: CursoDetail = {
  id: "c1",
  title: "Seguridad industrial",
  description: null,
  category: "curso",
  status: "publicado",
  cover: null,
  completedAt: null,
  lecciones: [leccion("l1", "Introducción", true), leccion("l2", "Equipos de protección", false), leccion("l3", "Cierre", false)],
};

describe("CursoViewer", () => {
  beforeEach(() => {
    marcarLeccionVista.mockReset();
    refresh.mockReset();
  });

  it("opens the first pending lesson and shows overall progress", () => {
    render(<CursoViewer curso={CURSO} />);
    expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
    expect(screen.getByText("1 de 3 lecciones vistas")).toBeTruthy();
  });

  it("marks the lesson as seen and moves to the next one", async () => {
    marcarLeccionVista.mockResolvedValue({});
    render(<CursoViewer curso={CURSO} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como vista" }));

    await waitFor(() => expect(marcarLeccionVista).toHaveBeenCalledWith("l2", "c1"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Cierre" })).toBeTruthy());
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the error when marking fails", async () => {
    marcarLeccionVista.mockResolvedValue({ error: "El curso no está publicado" });
    render(<CursoViewer curso={CURSO} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como vista" }));

    await waitFor(() => expect(screen.getByText("El curso no está publicado")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Equipos de protección" })).toBeTruthy();
  });

  it("does not offer marking a lesson already seen", () => {
    render(<CursoViewer curso={CURSO} />);
    fireEvent.click(screen.getByRole("button", { name: /Introducción/ }));
    expect(screen.queryByRole("button", { name: "Marcar como vista" })).toBeNull();
    expect(screen.getByText("Lección vista")).toBeTruthy();
  });

  it("shows a preview banner and no mark button for a draft course", () => {
    render(<CursoViewer curso={{ ...CURSO, status: "borrador" }} />);
    expect(screen.getByText(/Vista previa/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar como vista" })).toBeNull();
  });

  it("celebrates a completed course", () => {
    render(<CursoViewer curso={{ ...CURSO, completedAt: "2026-11-25T12:00:00Z" }} />);
    expect(screen.getByText("¡Completaste este curso!")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun x vitest run "src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx"`
Expected: FAIL (cannot resolve `./CursoViewer`).

- [ ] **Step 4: `CursoViewer.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstPendingLeccionId, nextLeccionId, progressPercent } from "@/lib/aprendizaje/mapCurso";
import { CATEGORY_LABELS, type CursoDetail } from "@/lib/aprendizaje/types";
import { marcarLeccionVista } from "../actions";
import { LeccionContent } from "./LeccionContent";

export function CursoViewer({ curso }: { curso: CursoDetail }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(() => firstPendingLeccionId(curso.lecciones));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = curso.lecciones.find((l) => l.id === selectedId) ?? curso.lecciones[0] ?? null;
  const done = curso.lecciones.filter((l) => l.completed).length;
  const percent = progressPercent(done, curso.lecciones.length);
  const isPreview = curso.status !== "publicado";

  function select(id: string) {
    setError(null);
    setSelectedId(id);
  }

  function markSeen() {
    if (!selected) return;
    const current = selected.id;
    setError(null);
    startTransition(async () => {
      const result = await marcarLeccionVista(current, curso.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      const next = nextLeccionId(curso.lecciones, current);
      if (next) setSelectedId(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <a href="/aprendizaje" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Volver al catálogo
        </a>
        <p className="text-xs font-medium tracking-wide text-[#04B1AF] uppercase">{CATEGORY_LABELS[curso.category]}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{curso.title}</h1>
        {curso.description && <p className="text-sm text-muted-foreground">{curso.description}</p>}
        <div className="max-w-md space-y-1">
          <p className="text-xs text-muted-foreground">
            {done} de {curso.lecciones.length} lecciones vistas
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {isPreview && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Vista previa: este curso no está publicado, así que no se registra avance.
        </p>
      )}
      {curso.completedAt && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          <PartyPopper className="size-4" />
          ¡Completaste este curso!
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <ol className="space-y-1">
          {curso.lecciones.map((l, i) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => select(l.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  l.id === selected?.id ? "bg-[#04B1AF]/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {l.completed ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="size-4 shrink-0" />
                )}
                <span className="truncate">
                  {i + 1}. {l.title}
                </span>
              </button>
            </li>
          ))}
        </ol>

        {selected ? (
          <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <LeccionContent leccion={selected} />
            <div className="flex flex-wrap items-center gap-3 border-t pt-4">
              {selected.completed ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  Lección vista
                </span>
              ) : (
                !isPreview && (
                  <Button onClick={markSeen} disabled={isPending}>
                    Marcar como vista
                  </Button>
                )
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Este curso todavía no tiene lecciones.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { aprendizajeFlags, getCurso } from "../actions";
import { CursoViewer } from "./CursoViewer";

export default async function CursoPage({ params }: { params: Promise<{ cursoId: string }> }) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { cursoId } = await params;
  // RLS returns drafts only to managers, so a learner opening a draft's URL gets a 404.
  const curso = await getCurso(cursoId);
  if (!curso) notFound();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
        <CursoViewer curso={curso} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `bun x vitest run "src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx"` — Expected: 6 passed.
Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/[cursoId]"` — Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/aprendizaje/[cursoId]"
git commit -m "feat(aprendizaje): course viewer with lessons, media and progress"
```

---

### Task 15: SharePoint upload button

**Files:**
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/SharePointUploadButton.tsx`
- Test: `src/app/(app)/aprendizaje/gestion/[cursoId]/SharePointUploadButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startUpload = vi.fn();
const uploadFileInChunks = vi.fn();

vi.mock("../actions", () => ({ startUpload: (...args: unknown[]) => startUpload(...args) }));
vi.mock("@/lib/aprendizaje/chunkedUpload", () => ({
  uploadFileInChunks: (...args: unknown[]) => uploadFileInChunks(...args),
}));

const { SharePointUploadButton } = await import("./SharePointUploadButton");

function pick(file: File) {
  fireEvent.change(screen.getByTestId("upload-input"), { target: { files: [file] } });
}

describe("SharePointUploadButton", () => {
  beforeEach(() => {
    startUpload.mockReset();
    uploadFileInChunks.mockReset();
  });

  it("opens a session, uploads the file and reports the uploaded item", async () => {
    startUpload.mockResolvedValue({ uploadUrl: "https://upload.example/s" });
    uploadFileInChunks.mockResolvedValue({ driveId: "d1", itemId: "i1" });
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    render(<SharePointUploadButton kind="archivo" label="Agregar archivo" onUploaded={onUploaded} />);

    pick(new File(["hola"], "guia.pdf", { type: "application/pdf" }));

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({
        driveId: "d1",
        itemId: "i1",
        filename: "guia.pdf",
        contentType: "application/pdf",
        sizeBytes: 4,
      }),
    );
    expect(startUpload).toHaveBeenCalledWith("archivo", { name: "guia.pdf", size: 4, type: "application/pdf" });
    expect(uploadFileInChunks.mock.calls[0][1]).toBe("https://upload.example/s");
  });

  it("rejects an invalid file before contacting the server", async () => {
    const onUploaded = vi.fn();
    render(<SharePointUploadButton kind="video" label="Subir video" onUploaded={onUploaded} />);

    pick(new File(["x"], "video.avi", { type: "video/x-msvideo" }));

    expect(await screen.findByText("El video debe ser MP4, WebM o MOV.")).toBeTruthy();
    expect(startUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows server and upload errors", async () => {
    startUpload.mockResolvedValue({ error: "No autorizado" });
    render(<SharePointUploadButton kind="archivo" label="Agregar archivo" onUploaded={vi.fn()} />);

    pick(new File(["hola"], "guia.pdf", { type: "application/pdf" }));

    expect(await screen.findByText("No autorizado")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]/SharePointUploadButton.test.tsx"`
Expected: FAIL (cannot resolve `./SharePointUploadButton`).

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFileInChunks } from "@/lib/aprendizaje/chunkedUpload";
import { UPLOAD_ACCEPT, validateUpload, type UploadKind } from "@/lib/aprendizaje/files";
import type { DriveFileRef } from "@/lib/aprendizaje/types";
import { startUpload } from "../actions";

export interface UploadedFile extends DriveFileRef {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Uploads straight from the browser to SharePoint: the server only opens
 * the upload session (startUpload), so large videos never go through
 * Vercel. onUploaded saves the reference and may return an error message.
 */
export function SharePointUploadButton({
  kind,
  label,
  onUploaded,
  disabled,
}: {
  kind: UploadKind;
  label: string;
  onUploaded: (file: UploadedFile) => Promise<string | undefined | void> | void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const invalid = validateUpload(kind, file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setProgress(0);
    try {
      const session = await startUpload(kind, { name: file.name, size: file.size, type: file.type });
      if (!session.uploadUrl) {
        setError(session.error ?? "No se pudo iniciar la subida.");
        return;
      }
      const item = await uploadFileInChunks(file, session.uploadUrl, { onProgress: setProgress });
      const saveError = await onUploaded({
        ...item,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (saveError) setError(saveError);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT[kind] || undefined}
        className="hidden"
        data-testid="upload-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || progress !== null}
        onClick={() => inputRef.current?.click()}
      >
        <Upload data-icon="inline-start" />
        {progress !== null ? `Subiendo… ${Math.round(progress * 100)}%` : label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]/SharePointUploadButton.test.tsx"`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/aprendizaje/gestion/[cursoId]/SharePointUploadButton.tsx" "src/app/(app)/aprendizaje/gestion/[cursoId]/SharePointUploadButton.test.tsx"
git commit -m "feat(aprendizaje): browser-to-SharePoint upload button"
```

---

### Task 16: Manager course list

**Files:**
- Create: `src/app/(app)/aprendizaje/gestion/NuevoCursoDialog.tsx`
- Create: `src/app/(app)/aprendizaje/gestion/page.tsx`

- [ ] **Step 1: `NuevoCursoDialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, FIELD_CLASS_NAME, type CursoCategory } from "@/lib/aprendizaje/types";
import { createCurso } from "./actions";

export function NuevoCursoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CursoCategory>("curso");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCurso({ title, description, category });
      if (result.error || !result.id) {
        setError(result.error ?? "No se pudo crear el curso.");
        return;
      }
      setOpen(false);
      router.push(`/aprendizaje/gestion/${result.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Nuevo curso
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo curso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="curso-title">Título</Label>
            <Input id="curso-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="curso-category">Categoría</Label>
            <select
              id="curso-category"
              className={FIELD_CLASS_NAME}
              value={category}
              onChange={(e) => setCategory(e.target.value as CursoCategory)}
            >
              {(Object.keys(CATEGORY_LABELS) as CursoCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="curso-description">Descripción</Label>
            <textarea
              id="curso-description"
              rows={3}
              className={FIELD_CLASS_NAME}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !title.trim()}>
            Crear y editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/aprendizaje/types";
import { aprendizajeFlags } from "../actions";
import { listCursosGestion } from "./actions";
import { NuevoCursoDialog } from "./NuevoCursoDialog";

export default async function AprendizajeGestionPage() {
  const flags = await aprendizajeFlags();
  if (!flags.canManage) redirect("/aprendizaje");
  const cursos = await listCursosGestion();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <a href="/aprendizaje" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Volver al catálogo
        </a>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Aprendizaje</h1>
            <p className="text-sm text-muted-foreground">Crea cursos y contenidos de historia, y publícalos.</p>
          </div>
          <NuevoCursoDialog />
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Lecciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cursos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <a href={`/aprendizaje/gestion/${c.id}`} className="font-medium text-[#04B1AF] hover:underline">
                      {c.title}
                    </a>
                  </TableCell>
                  <TableCell>{CATEGORY_LABELS[c.category]}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "publicado" ? "default" : c.status === "borrador" ? "secondary" : "outline"}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.leccionCount}</TableCell>
                </TableRow>
              ))}
              {cursos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Todavía no hay cursos. Crea el primero.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/gestion/page.tsx" "src/app/(app)/aprendizaje/gestion/NuevoCursoDialog.tsx"` — Expected: no errors.

```bash
git add "src/app/(app)/aprendizaje/gestion/page.tsx" "src/app/(app)/aprendizaje/gestion/NuevoCursoDialog.tsx"
git commit -m "feat(aprendizaje): manager course list and new-course dialog"
```

---

### Task 17: Course editor

**Files:**
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/LeccionEditor.tsx`
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.tsx`
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/page.tsx`
- Test: `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.test.tsx`

- [ ] **Step 1: `LeccionEditor.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileText, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_CLASS_NAME, type Leccion } from "@/lib/aprendizaje/types";
import { addLeccionArchivo, deleteLeccion, removeLeccionArchivo, setLeccionVideoFile, updateLeccion } from "../actions";
import { SharePointUploadButton } from "./SharePointUploadButton";

export function LeccionEditor({
  cursoId,
  leccion,
  index,
  isFirst,
  isLast,
  onMove,
}: {
  cursoId: string;
  leccion: Leccion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(leccion.title);
  const [body, setBody] = useState(leccion.body ?? "");
  const [videoUrl, setVideoUrl] = useState(leccion.videoUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function save() {
    run(() => updateLeccion(leccion.id, cursoId, { title, body, videoUrl }), () => setSaved(true));
  }

  function remove() {
    if (!confirm(`¿Eliminar la lección "${leccion.title}"? Se pierde el avance registrado en ella.`)) return;
    run(() => deleteLeccion(leccion.id, cursoId));
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col">
          <Button size="icon-xs" variant="ghost" disabled={isFirst || isPending} onClick={() => onMove(-1)} aria-label="Subir lección">
            <ChevronUp />
          </Button>
          <Button size="icon-xs" variant="ghost" disabled={isLast || isPending} onClick={() => onMove(1)} aria-label="Bajar lección">
            <ChevronDown />
          </Button>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {index + 1}. {leccion.title}
        </button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {[leccion.videoUrl || leccion.videoFile ? "video" : null, leccion.body ? "texto" : null, leccion.archivos.length ? `${leccion.archivos.length} archivo(s)` : null]
            .filter(Boolean)
            .join(" · ") || "vacía"}
        </span>
        <Button size="icon-sm" variant="ghost" onClick={remove} disabled={isPending} aria-label="Eliminar lección">
          <Trash2 />
        </Button>
      </div>

      {open && (
        <div className="space-y-4 border-t p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor={`leccion-title-${leccion.id}`}>Título de la lección</Label>
            <Input id={`leccion-title-${leccion.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`leccion-video-${leccion.id}`}>Video</Label>
            {leccion.videoFile ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>Video subido a SharePoint.</span>
                <Button size="sm" variant="ghost" onClick={() => run(() => setLeccionVideoFile(leccion.id, cursoId, null))}>
                  <X data-icon="inline-start" />
                  Quitar video
                </Button>
              </div>
            ) : (
              <Input
                id={`leccion-video-${leccion.id}`}
                placeholder="Enlace de YouTube, Vimeo o Stream (opcional)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
            )}
            <SharePointUploadButton
              kind="video"
              label={leccion.videoFile ? "Reemplazar video" : "O subir un video"}
              disabled={isPending}
              onUploaded={async (file) => {
                const result = await setLeccionVideoFile(leccion.id, cursoId, file);
                if (result.error) return result.error;
                setVideoUrl("");
                router.refresh();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`leccion-body-${leccion.id}`}>Contenido</Label>
            <textarea
              id={`leccion-body-${leccion.id}`}
              rows={6}
              className={FIELD_CLASS_NAME}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Texto de la lección (opcional)"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Guías, documentos e imágenes</p>
            <ul className="space-y-1">
              {leccion.archivos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Quitar ${a.filename}`}
                    onClick={() => run(() => removeLeccionArchivo(a.id, cursoId))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
            <SharePointUploadButton
              kind="archivo"
              label="Agregar archivo"
              disabled={isPending}
              onUploaded={async (file) => {
                const result = await addLeccionArchivo(leccion.id, cursoId, file);
                if (result.error) return result.error;
                router.refresh();
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={isPending || !title.trim()}>
              Guardar lección
            </Button>
            {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Guardado</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the failing test `CursoEditor.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoDetail } from "@/lib/aprendizaje/types";

const actions = {
  updateCurso: vi.fn(),
  setCursoStatus: vi.fn(),
  deleteCurso: vi.fn(),
  setCursoCover: vi.fn(),
  createLeccion: vi.fn(),
  reorderLecciones: vi.fn(),
  updateLeccion: vi.fn(),
  setLeccionVideoFile: vi.fn(),
  deleteLeccion: vi.fn(),
  addLeccionArchivo: vi.fn(),
  removeLeccionArchivo: vi.fn(),
  startUpload: vi.fn(),
};
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }));
vi.mock("../actions", () => actions);

const { CursoEditor } = await import("./CursoEditor");

function leccion(id: string, title: string) {
  return { id, position: 0, title, body: null, videoUrl: null, videoFile: null, archivos: [], completed: false };
}

const CURSO: CursoDetail = {
  id: "c1",
  title: "Historia de la empresa",
  description: "Nuestros orígenes",
  category: "historia",
  status: "borrador",
  cover: null,
  completedAt: null,
  lecciones: [leccion("l1", "Fundación"), leccion("l2", "Crecimiento")],
};

describe("CursoEditor", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset().mockResolvedValue({}));
    push.mockReset();
  });

  it("saves the course details", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Historia de Sánchez" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));

    await waitFor(() =>
      expect(actions.updateCurso).toHaveBeenCalledWith("c1", {
        title: "Historia de Sánchez",
        description: "Nuestros orígenes",
        category: "historia",
      }),
    );
  });

  it("publishes a draft and shows a server error", async () => {
    actions.setCursoStatus.mockResolvedValue({ error: "Agrega al menos una lección antes de publicar." });
    render(<CursoEditor curso={CURSO} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(actions.setCursoStatus).toHaveBeenCalledWith("c1", "publicado"));
    expect(await screen.findByText("Agrega al menos una lección antes de publicar.")).toBeTruthy();
  });

  it("offers archiving for a published course", () => {
    render(<CursoEditor curso={{ ...CURSO, status: "publicado" }} />);
    expect(screen.getByRole("button", { name: "Archivar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eliminar curso" })).toBeNull();
  });

  it("adds a lesson", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.change(screen.getByPlaceholderText("Título de la nueva lección"), { target: { value: "Hoy" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar lección/ }));

    await waitFor(() => expect(actions.createLeccion).toHaveBeenCalledWith("c1", "Hoy"));
  });

  it("moves a lesson down", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Bajar lección" })[0]);

    await waitFor(() => expect(actions.reorderLecciones).toHaveBeenCalledWith("c1", ["l2", "l1"]));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.test.tsx"`
Expected: FAIL (cannot resolve `./CursoEditor`).

- [ ] **Step 4: `CursoEditor.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archivoUrl,
  CATEGORY_LABELS,
  FIELD_CLASS_NAME,
  STATUS_LABELS,
  type CursoCategory,
  type CursoDetail,
  type CursoStatus,
} from "@/lib/aprendizaje/types";
import { createLeccion, deleteCurso, reorderLecciones, setCursoCover, setCursoStatus, updateCurso } from "../actions";
import { LeccionEditor } from "./LeccionEditor";
import { SharePointUploadButton } from "./SharePointUploadButton";

const STATUS_ACTIONS: Record<CursoStatus, { label: string; to: CursoStatus }[]> = {
  borrador: [{ label: "Publicar", to: "publicado" }],
  publicado: [
    { label: "Pasar a borrador", to: "borrador" },
    { label: "Archivar", to: "archivado" },
  ],
  archivado: [{ label: "Publicar de nuevo", to: "publicado" }],
};

export function CursoEditor({ curso }: { curso: CursoDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(curso.title);
  const [description, setDescription] = useState(curso.description ?? "");
  const [category, setCategory] = useState<CursoCategory>(curso.category);
  const [newLeccion, setNewLeccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const ids = curso.lecciones.map((l) => l.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderLecciones(curso.id, ids));
  }

  function remove() {
    if (!confirm(`¿Eliminar el curso "${curso.title}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCurso(curso.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/aprendizaje/gestion");
    });
  }

  return (
    <div className="space-y-6">
      <a href="/aprendizaje/gestion" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Volver a Gestión
      </a>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{curso.title}</h1>
        <Badge variant={curso.status === "publicado" ? "default" : curso.status === "borrador" ? "secondary" : "outline"}>
          {STATUS_LABELS[curso.status]}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <a
            href={`/aprendizaje/${curso.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted"
          >
            <Eye className="size-4" />
            Vista previa
          </a>
          {STATUS_ACTIONS[curso.status].map((a) => (
            <Button
              key={a.to}
              variant={a.to === "publicado" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => run(() => setCursoStatus(curso.id, a.to))}
            >
              {a.label}
            </Button>
          ))}
          {curso.status === "borrador" && (
            <Button variant="destructive" disabled={isPending} onClick={remove}>
              Eliminar curso
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Datos del curso</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="editor-title">Título</Label>
            <Input id="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editor-category">Categoría</Label>
            <select
              id="editor-category"
              className={FIELD_CLASS_NAME}
              value={category}
              onChange={(e) => setCategory(e.target.value as CursoCategory)}
            >
              {(Object.keys(CATEGORY_LABELS) as CursoCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="editor-description">Descripción</Label>
            <textarea
              id="editor-description"
              rows={3}
              className={FIELD_CLASS_NAME}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Button
            disabled={isPending || !title.trim()}
            onClick={() => run(() => updateCurso(curso.id, { title, description, category }), () => setNotice("Datos guardados."))}
          >
            Guardar datos
          </Button>
          <div className="flex items-center gap-3">
            {curso.cover && (
              // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
              <img src={archivoUrl(curso.cover)} alt="Portada" className="h-12 w-20 rounded border object-cover" />
            )}
            <SharePointUploadButton
              kind="portada"
              label={curso.cover ? "Cambiar portada" : "Subir portada"}
              disabled={isPending}
              onUploaded={async (file) => {
                const result = await setCursoCover(curso.id, file);
                if (result.error) return result.error;
                router.refresh();
              }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lecciones</h2>
        {curso.lecciones.map((l, i) => (
          <LeccionEditor
            key={l.id}
            cursoId={curso.id}
            leccion={l}
            index={i}
            isFirst={i === 0}
            isLast={i === curso.lecciones.length - 1}
            onMove={(direction) => move(i, direction)}
          />
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="Título de la nueva lección"
            value={newLeccion}
            onChange={(e) => setNewLeccion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLeccion.trim()) run(() => createLeccion(curso.id, newLeccion), () => setNewLeccion(""));
            }}
          />
          <Button
            variant="outline"
            disabled={isPending || !newLeccion.trim()}
            onClick={() => run(() => createLeccion(curso.id, newLeccion), () => setNewLeccion(""))}
          >
            <Plus data-icon="inline-start" />
            Agregar lección
          </Button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: `page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { aprendizajeFlags } from "../../actions";
import { getCursoGestion } from "../actions";
import { CursoEditor } from "./CursoEditor";

export default async function CursoGestionPage({ params }: { params: Promise<{ cursoId: string }> }) {
  const flags = await aprendizajeFlags();
  if (!flags.canManage) redirect("/aprendizaje");

  const { cursoId } = await params;
  const curso = await getCursoGestion(cursoId);
  if (!curso) notFound();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
        {/* key: after router.refresh() the editor's local form state resets to the saved values */}
        <CursoEditor key={curso.id} curso={curso} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]"` — Expected: CursoEditor 5 passed, SharePointUploadButton 3 passed.
Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje"` — Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/aprendizaje/gestion/[cursoId]"
git commit -m "feat(aprendizaje): course editor with lessons, video, files and cover"
```

---

### Task 18: Full verification

- [ ] **Step 1: Unit + component tests**

Run: `bun x vitest run src/lib/aprendizaje "src/app/(app)/aprendizaje"` — Expected: all pass.

- [ ] **Step 2: Integration tests** (migrations applied in Task 3)

Run: `bun x vitest run src/test/integration/aprendizajeRls.test.ts` — Expected: 7 passed.

- [ ] **Step 3: Typecheck and lint everything touched**

Run: `bun x tsc --noEmit -p .` and `bun x eslint src/lib/aprendizaje src/lib/sharepoint.ts "src/app/(app)/aprendizaje" src/app/api/aprendizaje "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"` — Expected: no errors.

- [ ] **Step 4: Smoke test in the dev server**

Run (background): `bun --bun next dev -p 3125`, then:
- `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3125/aprendizaje` → `307 …/login` (requires auth, like every app page).
- Check the dev log for compile errors on `/aprendizaje`, `/aprendizaje/gestion` (`grep -i error`).
Stop the dev server afterwards.

- [ ] **Step 5: Report** what was verified, what needs a real browser (upload of a large video, playback, YouTube embed), and that deploying requires the migrations to be applied first.
