# Aprendizaje — Nueva portada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `/aprendizaje` catalog with the portal the user approved (design: https://claude.ai/artifact/Wpi7HGH33CAKKfypdNbfAx): a banner with the person's photo, name, role and stats; "Continúa donde te quedaste"; "Mis certificados" (completed courses; the PDF arrives in Fase 4); "Próximamente" (drafts the area chose to announce); and the catalog with its Cursos/Historia tabs.

**Architecture:** One small migration adds `aprendizaje_cursos.anunciar_proximamente` and a `security definer` RPC `aprendizaje_proximamente()` that exposes only teaser fields of announced drafts (learners can't read drafts through RLS). `CatalogCurso` gains `enrolled`, `hasEvaluacion` and `bestScore`, so one catalog query feeds every section. Pure helpers that split the catalog and write the banner sentence go in `src/lib/aprendizaje/portada.ts`. Presentational pieces are server components. Managers get an "Anunciar como Próximamente" checkbox on drafts.

**Tech Stack:** Next.js 16 App Router, Supabase, Tailwind, Vitest + Testing Library, Bun.

**Decisions confirmed with the user (2026-11-25/26):** "cursos que se están elaborando" means both *en progreso* (what the person is taking) and *Próximamente* (what the area is preparing). Certificates section now, PDF later (Fase 4). Photo from the Agenda de contactos (`contacts.photo_url`, matched by email), initials as fallback. Only drafts explicitly marked by a manager are announced.

**Conventions:** as in the Fase 1/3 plans. Migration applied by the user via the Supabase SQL Editor of the production project (`yeblzz…`) **before** deploying (the new code selects the new column).

---

### Task 1: Migration

**Files:** Create `supabase/migrations/20261126100000_aprendizaje_proximamente.sql`

- [ ] **Step 1: Write it**

```sql
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
```

- [ ] **Step 2: Commit** — `git add supabase/migrations/20261126100000_aprendizaje_proximamente.sql && git commit -m "feat(aprendizaje): announce draft courses as Próximamente"`

---

### Task 2: Types and mapping

**Files:** Modify `src/lib/aprendizaje/types.ts`, `src/lib/aprendizaje/mapCurso.ts`, `src/lib/aprendizaje/mapCurso.test.ts`, and the `CURSO` fixtures in `src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx` and `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.test.tsx`

- [ ] **Step 1: `types.ts`**
  - In `CursoDetail`, after `evaluacion: EvalSettings;` add `anunciarProximamente: boolean;`.
  - In `CatalogCurso`, after `completedAt: string | null;` add:

```ts
  /** The person has started it (an inscripción exists). */
  enrolled: boolean;
  hasEvaluacion: boolean;
  /** Best submitted evaluation score, if any. */
  bestScore: number | null;
```

  - Append:

```ts
export const CATEGORY_SHORT_LABELS: Record<CursoCategory, string> = {
  curso: "Curso",
  historia: "Historia",
};

export interface PerfilAprendizaje {
  name: string;
  position: string | null;
  department: string | null;
  photoUrl: string | null;
}

export interface ProximoCurso {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
}
```

- [ ] **Step 2: Failing tests** — in `mapCurso.test.ts`, replace the `toCatalogCurso` describe with:

```ts
describe("toCatalogCurso", () => {
  it("counts lessons, completed lessons and carries enrollment, evaluation and best score", () => {
    expect(
      toCatalogCurso(
        { ...RAW, eval_questions_per_attempt: 5 },
        new Set(["l2", "other"]),
        { completedAt: "2026-11-25T12:00:00Z" },
        90,
      ),
    ).toMatchObject({
      leccionCount: 2,
      completedLecciones: 1,
      completedAt: "2026-11-25T12:00:00Z",
      enrolled: true,
      hasEvaluacion: true,
      bestScore: 90,
    });
  });

  it("marks a course never started as not enrolled", () => {
    expect(toCatalogCurso(RAW, new Set(), null)).toMatchObject({
      enrolled: false,
      completedAt: null,
      hasEvaluacion: false,
      bestScore: null,
    });
  });
});
```

and append to the `toCursoDetail` describe:

```ts
  it("maps the Próximamente flag", () => {
    expect(toCursoDetail(RAW, new Set(), null).anunciarProximamente).toBe(false);
    expect(toCursoDetail({ ...RAW, anunciar_proximamente: true }, new Set(), null).anunciarProximamente).toBe(true);
  });
```

Run `bun x vitest run src/lib/aprendizaje/mapCurso.test.ts` — Expected: FAIL.

- [ ] **Step 3: `mapCurso.ts`**
  - `RawCurso`: after `eval_max_attempts?: number | null;` add `anunciar_proximamente?: boolean | null;`.
  - `toCursoDetail` return: after the `evaluacion: {…},` block add `anunciarProximamente: raw.anunciar_proximamente ?? false,`.
  - Replace `toCatalogCurso` with:

```ts
export function toCatalogCurso(
  raw: RawCurso,
  completedLeccionIds: ReadonlySet<string>,
  inscripcion: { completedAt: string | null } | null,
  bestScore: number | null = null,
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
    completedAt: inscripcion?.completedAt ?? null,
    enrolled: inscripcion !== null,
    hasEvaluacion: raw.eval_questions_per_attempt != null,
    bestScore,
  };
}
```

- [ ] **Step 4: Fixtures** — in both component tests add `anunciarProximamente: false,` after the `evaluacion: {…},` line of `CURSO`.

- [ ] **Step 5: Verify** — `bun x vitest run src/lib/aprendizaje/mapCurso.test.ts` passes (tsc will fail until Task 4 updates `listCatalog`; commit after Task 4).

---

### Task 3: Portal helpers

**Files:** Create `src/lib/aprendizaje/portada.ts`, test `src/lib/aprendizaje/portada.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { formatFecha, initials, primerNombre, siguientePaso, splitMisCursos } from "./portada";
import type { CatalogCurso } from "./types";

function curso(overrides: Partial<CatalogCurso>): CatalogCurso {
  return {
    id: "c",
    title: "Curso",
    description: null,
    category: "curso",
    cover: null,
    leccionCount: 4,
    completedLecciones: 0,
    completedAt: null,
    enrolled: false,
    hasEvaluacion: false,
    bestScore: null,
    ...overrides,
  };
}

describe("splitMisCursos", () => {
  it("separates in-progress (most advanced first) from completed (most recent first)", () => {
    const { enProgreso, completados } = splitMisCursos([
      curso({ id: "nuevo" }),
      curso({ id: "poco", enrolled: true, completedLecciones: 1 }),
      curso({ id: "mucho", enrolled: true, completedLecciones: 3 }),
      curso({ id: "viejo", enrolled: true, completedLecciones: 4, completedAt: "2026-10-01T00:00:00Z" }),
      curso({ id: "reciente", enrolled: true, completedLecciones: 4, completedAt: "2026-11-20T00:00:00Z" }),
    ]);
    expect(enProgreso.map((c) => c.id)).toEqual(["mucho", "poco"]);
    expect(completados.map((c) => c.id)).toEqual(["reciente", "viejo"]);
  });
});

describe("siguientePaso", () => {
  it("counts the lessons left in the most advanced course", () => {
    expect(siguientePaso([curso({ title: "Seguridad", enrolled: true, completedLecciones: 3 })])).toBe(
      "Te falta 1 lección para terminar “Seguridad”.",
    );
    expect(siguientePaso([curso({ title: "Seguridad", enrolled: true, completedLecciones: 1 })])).toBe(
      "Te faltan 3 lecciones para terminar “Seguridad”.",
    );
  });

  it("points to the pending evaluation", () => {
    expect(
      siguientePaso([curso({ title: "Seguridad", enrolled: true, completedLecciones: 4, hasEvaluacion: true })]),
    ).toBe("Solo te falta la evaluación de “Seguridad”.");
  });

  it("returns null with nothing in progress", () => {
    expect(siguientePaso([])).toBeNull();
  });
});

describe("name helpers", () => {
  it("initials and first name", () => {
    expect(initials("María Rodríguez Peña")).toBe("MR");
    expect(initials("ana")).toBe("A");
    expect(initials("")).toBe("?");
    expect(primerNombre("María Rodríguez")).toBe("María");
    expect(primerNombre("persona@empresa.com")).toBe("persona@empresa.com");
  });
});

describe("formatFecha", () => {
  it("formats in the business timezone as dd/mm/yyyy", () => {
    expect(formatFecha("2026-11-12T15:00:00Z")).toBe("12/11/2026");
    // 02:00 UTC is still the previous evening in Santo Domingo (UTC-4).
    expect(formatFecha("2026-11-13T02:00:00Z")).toBe("12/11/2026");
  });
});
```

Run `bun x vitest run src/lib/aprendizaje/portada.test.ts` — Expected: FAIL.

- [ ] **Step 2: `portada.ts`**

```ts
import { progressPercent } from "./mapCurso";
import type { CatalogCurso } from "./types";

const TIMEZONE = "America/Santo_Domingo";

export function splitMisCursos(cursos: CatalogCurso[]): { enProgreso: CatalogCurso[]; completados: CatalogCurso[] } {
  const percent = (c: CatalogCurso) => progressPercent(c.completedLecciones, c.leccionCount);
  return {
    enProgreso: cursos.filter((c) => c.enrolled && !c.completedAt).sort((a, b) => percent(b) - percent(a)),
    completados: cursos
      .filter((c) => c.completedAt)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
  };
}

/** The banner's nudge, based on the most advanced course in progress. */
export function siguientePaso(enProgreso: CatalogCurso[]): string | null {
  const curso = enProgreso[0];
  if (!curso) return null;
  const faltan = curso.leccionCount - curso.completedLecciones;
  if (faltan > 0) {
    return `Te ${faltan === 1 ? "falta 1 lección" : `faltan ${faltan} lecciones`} para terminar “${curso.title}”.`;
  }
  if (curso.hasEvaluacion) return `Solo te falta la evaluación de “${curso.title}”.`;
  return null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export function primerNombre(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
```

Run the test — Expected: PASS. (If `es-DO` formats differently in the runtime, assert the actual separator output and keep `dd/mm/yyyy`.)

- [ ] **Step 3: Commit** with Task 2 after Task 4 compiles.

---

### Task 4: Learner actions

**Files:** Modify `src/app/(app)/aprendizaje/actions.ts`

- [ ] **Step 1: Imports** — add `import { createAdminClient } from "@/lib/supabase/admin";` and extend the types import to `import type { CatalogCurso, CursoDetail, PerfilAprendizaje, ProximoCurso } from "@/lib/aprendizaje/types";`.

- [ ] **Step 2: `CURSO_DETAIL_SELECT`** — its first line becomes:

```ts
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, eval_questions_per_attempt, eval_passing_score, eval_max_attempts, anunciar_proximamente, " +
```

(same change in `src/app/(app)/aprendizaje/gestion/actions.ts`).

- [ ] **Step 3: `myProgress`** — replace it with a version that also returns best scores:

```ts
async function myProgress(): Promise<{
  leccionIds: Set<string>;
  completedByCurso: Map<string, string | null>;
  bestScoreByCurso: Map<string, number>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { leccionIds: new Set(), completedByCurso: new Map(), bestScoreByCurso: new Map() };

  const [{ data: progreso }, { data: inscripciones }, { data: intentos }] = await Promise.all([
    supabase.from("aprendizaje_progreso_lecciones").select("leccion_id").eq("app_user_id", user.id),
    supabase.from("aprendizaje_inscripciones").select("curso_id, completed_at").eq("app_user_id", user.id),
    supabase
      .from("aprendizaje_intentos")
      .select("curso_id, score")
      .eq("app_user_id", user.id)
      .not("submitted_at", "is", null),
  ]);
  const bestScoreByCurso = new Map<string, number>();
  for (const i of intentos ?? []) {
    const score = (i.score as number | null) ?? 0;
    bestScoreByCurso.set(i.curso_id as string, Math.max(score, bestScoreByCurso.get(i.curso_id as string) ?? 0));
  }
  return {
    leccionIds: new Set((progreso ?? []).map((p) => p.leccion_id as string)),
    completedByCurso: new Map((inscripciones ?? []).map((i) => [i.curso_id as string, i.completed_at as string | null])),
    bestScoreByCurso,
  };
}
```

- [ ] **Step 4: `listCatalog`** — select `"id, title, description, category, status, cover_drive_id, cover_item_id, eval_questions_per_attempt, aprendizaje_lecciones(id)"` and map with:

```ts
  return ((data ?? []) as unknown as RawCurso[]).map((raw) =>
    toCatalogCurso(
      raw,
      progress.leccionIds,
      progress.completedByCurso.has(raw.id) ? { completedAt: progress.completedByCurso.get(raw.id) ?? null } : null,
      progress.bestScoreByCurso.get(raw.id) ?? null,
    ),
  );
```

- [ ] **Step 5: Append**

```ts
/** The banner's identity: the caller's own Agenda contact, matched by email. */
export async function getMiPerfil(): Promise<PerfilAprendizaje> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fallback: PerfilAprendizaje = { name: user?.email ?? "", position: null, department: null, photoUrl: null };
  if (!user?.email) return fallback;

  // Same lookup as planificacion's getMyContact: only the caller's own row, by their own email.
  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("first_name, last_name, position, photo_url, departments(name)")
    .eq("email", user.email)
    .maybeSingle();
  if (!contact) return fallback;
  const dept = Array.isArray(contact.departments) ? contact.departments[0] : contact.departments;
  return {
    name: `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || user.email,
    position: contact.position || null,
    department: dept?.name ?? null,
    photoUrl: contact.photo_url || null,
  };
}

export async function listProximos(): Promise<ProximoCurso[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("aprendizaje_proximamente");
  return ((data ?? []) as { id: string; title: string; description: string | null; category: ProximoCurso["category"] }[]).map(
    (p) => ({ id: p.id, title: p.title, description: p.description, category: p.category }),
  );
}
```

- [ ] **Step 6: Verify and commit Tasks 2–4**

Run `bun x vitest run src/lib/aprendizaje "src/app/(app)/aprendizaje"`, `bun x tsc --noEmit -p .`, `bun x eslint src/lib/aprendizaje "src/app/(app)/aprendizaje"` — all clean.

```bash
git add src/lib/aprendizaje "src/app/(app)/aprendizaje"
git commit -m "feat(aprendizaje): portal data (enrollment, best score, profile, Próximamente)"
```

---

### Task 5: Portal components

**Files:** Create `src/app/(app)/aprendizaje/PortadaBanner.tsx`, `EnProgresoCard.tsx`, `CertificadoCard.tsx`, `ProximoCard.tsx`; test `src/app/(app)/aprendizaje/PortadaBanner.test.tsx`

- [ ] **Step 1: Failing test `PortadaBanner.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortadaBanner } from "./PortadaBanner";

const PERFIL = {
  name: "María Rodríguez",
  position: "Analista",
  department: "Gestión Humana",
  photoUrl: "https://example.com/maria.jpg",
};

describe("PortadaBanner", () => {
  it("greets the person with photo, role and stats", () => {
    render(
      <PortadaBanner
        perfil={PERFIL}
        siguientePaso="Te falta 1 lección para terminar “Seguridad”."
        stats={{ completados: 3, enProgreso: 2, certificados: 3 }}
        canManage={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Hola, María" })).toBeTruthy();
    expect(screen.getByText("Analista · Gestión Humana")).toBeTruthy();
    expect((screen.getByAltText("Foto de María Rodríguez") as HTMLImageElement).src).toBe(PERFIL.photoUrl);
    expect(screen.getByText("Te falta 1 lección para terminar “Seguridad”.")).toBeTruthy();
    expect(screen.getByText("En progreso").nextElementSibling?.textContent).toBe("2");
    expect(screen.queryByRole("link", { name: /Gestionar cursos/ })).toBeNull();
  });

  it("falls back to initials, a default nudge, and shows the manager link", () => {
    render(
      <PortadaBanner
        perfil={{ ...PERFIL, photoUrl: null, position: null, department: null }}
        siguientePaso={null}
        stats={{ completados: 0, enProgreso: 0, certificados: 0 }}
        canManage
      />,
    );
    expect(screen.getByText("MR")).toBeTruthy();
    expect(screen.getByText("Explora el catálogo y empieza tu próximo curso.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gestionar cursos/ }).getAttribute("href")).toBe("/aprendizaje/gestion");
  });
});
```

Run `bun x vitest run "src/app/(app)/aprendizaje/PortadaBanner.test.tsx"` — Expected: FAIL.

- [ ] **Step 2: `PortadaBanner.tsx`**

```tsx
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { initials, primerNombre } from "@/lib/aprendizaje/portada";
import type { PerfilAprendizaje } from "@/lib/aprendizaje/types";

export function PortadaBanner({
  perfil,
  siguientePaso,
  stats,
  canManage,
}: {
  perfil: PerfilAprendizaje;
  siguientePaso: string | null;
  stats: { completados: number; enProgreso: number; certificados: number };
  canManage: boolean;
}) {
  const role = [perfil.position, perfil.department].filter(Boolean).join(" · ");
  const items = [
    { label: "Completados", value: stats.completados },
    { label: "En progreso", value: stats.enProgreso },
    { label: "Certificados", value: stats.certificados },
  ];

  return (
    <section aria-label="Bienvenida" className="relative overflow-hidden rounded-3xl bg-[#036E6C] p-6 text-white sm:p-10">
      <svg
        aria-hidden="true"
        viewBox="0 0 520 360"
        className="pointer-events-none absolute -top-16 -right-20 h-[360px] w-[520px] opacity-20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="300" cy="180" r="70" />
        <circle cx="300" cy="180" r="120" />
        <circle cx="300" cy="180" r="170" />
        <circle cx="300" cy="180" r="220" />
        <path d="M60 330 L300 180 L500 40" />
      </svg>

      <div className="relative flex flex-wrap items-center justify-between gap-8">
        <div className="flex min-w-0 flex-1 basis-[420px] items-center gap-5 sm:gap-6">
          {perfil.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Agenda photos are external URLs
            <img
              src={perfil.photoUrl}
              alt={`Foto de ${perfil.name}`}
              className="size-20 shrink-0 rounded-full border-4 border-white/85 object-cover sm:size-28"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-white/85 bg-[#D7F3F2] text-2xl font-bold text-[#036E6C] sm:size-28 sm:text-4xl"
            >
              {initials(perfil.name)}
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-semibold tracking-widest text-[#CFF5F3] uppercase">Aprendizaje</p>
            <h1 className="text-3xl leading-tight font-extrabold sm:text-4xl">Hola, {primerNombre(perfil.name)}</h1>
            {role && <p className="text-sm text-[#E6FAF9] sm:text-base">{role}</p>}
            <p className="pt-1 text-base font-medium sm:text-lg">
              {siguientePaso ?? "Explora el catálogo y empieza tu próximo curso."}
            </p>
            {canManage && (
              <Link
                href="/aprendizaje/gestion"
                className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/40 bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
              >
                <Settings2 className="size-4" />
                Gestionar cursos
              </Link>
            )}
          </div>
        </div>

        <dl className="grid w-full max-w-md grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col rounded-2xl border border-white/30 bg-white/15 p-4">
              <dt className="order-2 text-sm text-[#E6FAF9]">{item.label}</dt>
              <dd className="order-1 text-3xl font-extrabold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
```

Note: in the DOM `dt` comes before `dd` (correct semantics); CSS `order` shows the number on top. The test reads `nextElementSibling` of the label for that reason.

- [ ] **Step 3: `EnProgresoCard.tsx`**

```tsx
import Link from "next/link";
import { BookOpen, Landmark } from "lucide-react";
import { progressPercent } from "@/lib/aprendizaje/mapCurso";
import { archivoUrl, CATEGORY_SHORT_LABELS, type CatalogCurso } from "@/lib/aprendizaje/types";

export function EnProgresoCard({ curso }: { curso: CatalogCurso }) {
  const percent = progressPercent(curso.completedLecciones, curso.leccionCount);
  const faltan = curso.leccionCount - curso.completedLecciones;
  const detalle =
    faltan > 0
      ? `${curso.completedLecciones} de ${curso.leccionCount} lecciones`
      : curso.hasEvaluacion
        ? "Lecciones listas · falta la evaluación"
        : `${curso.leccionCount} lecciones`;
  const Icon = curso.category === "historia" ? Landmark : BookOpen;

  return (
    <Link
      href={`/aprendizaje/${curso.id}`}
      className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#04B1AF]/10 text-[#036E6C] sm:size-24">
        {curso.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
          <img src={archivoUrl(curso.cover)} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-9" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
          {CATEGORY_SHORT_LABELS[curso.category]}
        </p>
        <h3 className="truncate font-bold text-foreground">{curso.title}</h3>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums">{percent}%</span>
        </div>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </div>
      <span className="hidden shrink-0 rounded-lg bg-[#036E6C] px-4 py-2.5 text-sm font-semibold text-white group-hover:bg-[#024E4D] sm:inline-flex">
        Continuar
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: `CertificadoCard.tsx`**

```tsx
import Link from "next/link";
import { Award } from "lucide-react";
import { formatFecha } from "@/lib/aprendizaje/portada";
import type { CatalogCurso } from "@/lib/aprendizaje/types";

export function CertificadoCard({ curso }: { curso: CatalogCurso }) {
  return (
    <Link
      href={`/aprendizaje/${curso.id}`}
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-xl border border-dashed border-[#04B1AF]/40" />
      <div className="relative flex items-center gap-2.5">
        <span className="flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Award className="size-6" />
        </span>
        <span className="text-xs font-bold tracking-widest text-amber-800 uppercase dark:text-amber-300">Certificado</span>
      </div>
      <h3 className="relative font-bold text-foreground">{curso.title}</h3>
      <p className="relative text-sm text-muted-foreground">
        {curso.completedAt && `Completado el ${formatFecha(curso.completedAt)}`}
        {curso.bestScore !== null && ` · Nota ${curso.bestScore}%`}
      </p>
      <span className="relative self-start rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
        PDF próximamente
      </span>
    </Link>
  );
}
```

- [ ] **Step 5: `ProximoCard.tsx`**

```tsx
import { CATEGORY_SHORT_LABELS, type ProximoCurso } from "@/lib/aprendizaje/types";

export function ProximoCard({ curso }: { curso: ProximoCurso }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-dashed bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-300">
          Próximamente
        </span>
        <span className="text-xs text-muted-foreground">{CATEGORY_SHORT_LABELS[curso.category]}</span>
      </div>
      <h3 className="font-bold text-foreground">{curso.title}</h3>
      <p className="text-sm text-muted-foreground">{curso.description || "El área lo está preparando."}</p>
    </article>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run the banner test (2 pass), `bun x tsc --noEmit -p .`, `bun x eslint "src/app/(app)/aprendizaje"`.

```bash
git add "src/app/(app)/aprendizaje/PortadaBanner.tsx" "src/app/(app)/aprendizaje/PortadaBanner.test.tsx" "src/app/(app)/aprendizaje/EnProgresoCard.tsx" "src/app/(app)/aprendizaje/CertificadoCard.tsx" "src/app/(app)/aprendizaje/ProximoCard.tsx"
git commit -m "feat(aprendizaje): portal banner and section cards"
```

---

### Task 6: Portal page

**Files:** Replace `src/app/(app)/aprendizaje/page.tsx`

- [ ] **Step 1: Write it**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { splitMisCursos, siguientePaso } from "@/lib/aprendizaje/portada";
import { CATEGORY_LABELS, type CursoCategory } from "@/lib/aprendizaje/types";
import { aprendizajeFlags, getMiPerfil, listCatalog, listProximos } from "./actions";
import { CertificadoCard } from "./CertificadoCard";
import { CursoCard } from "./CursoCard";
import { EnProgresoCard } from "./EnProgresoCard";
import { PortadaBanner } from "./PortadaBanner";
import { ProximoCard } from "./ProximoCard";

const CATEGORIES: CursoCategory[] = ["curso", "historia"];

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function AprendizajePage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { categoria } = await searchParams;
  const category: CursoCategory = categoria === "historia" ? "historia" : "curso";
  const [catalogo, perfil, proximos] = await Promise.all([listCatalog(), getMiPerfil(), listProximos()]);
  const { enProgreso, completados } = splitMisCursos(catalogo);
  const visibles = catalogo.filter((c) => c.category === category);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="mx-auto w-full max-w-7xl min-w-0 space-y-10 p-4 sm:p-6 lg:p-8">
        <PortadaBanner
          perfil={perfil}
          siguientePaso={siguientePaso(enProgreso)}
          stats={{ completados: completados.length, enProgreso: enProgreso.length, certificados: completados.length }}
          canManage={flags.canManage}
        />

        {enProgreso.length > 0 && (
          <Section
            id="en-progreso"
            title="Continúa donde te quedaste"
            aside={
              <span className="text-sm text-muted-foreground">
                {enProgreso.length} {enProgreso.length === 1 ? "curso" : "cursos"} en progreso
              </span>
            }
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {enProgreso.map((c) => (
                <EnProgresoCard key={c.id} curso={c} />
              ))}
            </div>
          </Section>
        )}

        <Section
          id="certificados"
          title="Mis certificados"
          aside={<span className="text-sm text-muted-foreground">Descarga en PDF próximamente</span>}
        >
          {completados.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {completados.map((c) => (
                <CertificadoCard key={c.id} curso={c} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Completa un curso para obtener tu primer certificado.
            </p>
          )}
        </Section>

        {proximos.length > 0 && (
          <Section id="proximamente" title="Próximamente">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {proximos.map((p) => (
                <ProximoCard key={p.id} curso={p} />
              ))}
            </div>
          </Section>
        )}

        <Section
          id="catalogo"
          title="Explora el catálogo"
          aside={
            <nav aria-label="Categorías" className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Link
                  key={c}
                  href={c === "curso" ? "/aprendizaje#catalogo" : `/aprendizaje?categoria=${c}#catalogo`}
                  aria-current={c === category ? "page" : undefined}
                  className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold ${
                    c === category ? "bg-[#036E6C] text-white" : "border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </Link>
              ))}
            </nav>
          }
        >
          {visibles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay contenidos publicados aquí.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((curso) => (
                <CursoCard key={curso.id} curso={curso} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run `bun x tsc --noEmit -p .`, `bun x eslint "src/app/(app)/aprendizaje"`.

```bash
git add "src/app/(app)/aprendizaje/page.tsx"
git commit -m "feat(aprendizaje): new portal page (banner, progress, certificates, Próximamente, catalog)"
```

---

### Task 7: "Anunciar como Próximamente" in Gestión

**Files:** Modify `src/app/(app)/aprendizaje/gestion/actions.ts`, `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.tsx`, `CursoEditor.test.tsx`

- [ ] **Step 1: Failing test** — in `CursoEditor.test.tsx` add `setAnunciarProximamente: vi.fn(),` to `actions` and append:

```tsx
  it("announces a draft as Próximamente", async () => {
    render(<CursoEditor curso={CURSO} />);
    fireEvent.click(screen.getByLabelText(/Anunciar como “Próximamente”/));
    await waitFor(() => expect(actions.setAnunciarProximamente).toHaveBeenCalledWith("c1", true));
  });

  it("only offers the announcement for drafts", () => {
    render(<CursoEditor curso={{ ...CURSO, status: "publicado" }} />);
    expect(screen.queryByLabelText(/Anunciar como “Próximamente”/)).toBeNull();
  });
```

Run — Expected: FAIL.

- [ ] **Step 2: Action** — append to `gestion/actions.ts`:

```ts
export async function setAnunciarProximamente(cursoId: string, value: boolean): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_cursos").update({ anunciar_proximamente: value }).eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}
```

- [ ] **Step 3: Editor** — import `setAnunciarProximamente` with the other actions, and right after the `<div className="flex flex-wrap items-end gap-4">…</div>` block (Guardar datos + portada) inside "Datos del curso", add:

```tsx
        {curso.status === "borrador" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={curso.anunciarProximamente}
              disabled={isPending}
              onChange={(e) => run(() => setAnunciarProximamente(curso.id, e.target.checked))}
              className="accent-[#04B1AF]"
            />
            Anunciar como “Próximamente” en la portada (se muestran solo el título y la descripción)
          </label>
        )}
```

- [ ] **Step 4: Verify and commit**

Run `bun x vitest run "src/app/(app)/aprendizaje"`, tsc, eslint — clean.

```bash
git add "src/app/(app)/aprendizaje/gestion"
git commit -m "feat(aprendizaje): let managers announce drafts as Próximamente"
```

---

### Task 8: Integration test for Próximamente

**Files:** Modify `src/test/integration/aprendizajeRls.test.ts` (append inside the describe)

- [ ] **Step 1: Test**

```ts
  it("shows learners only the teaser of drafts announced as Próximamente", async () => {
    const announced = await createCurso("borrador", 1);
    const hidden = await createCurso("borrador", 1);
    const published = await createCurso("publicado", 1);
    await manager.client.from("aprendizaje_cursos").update({ anunciar_proximamente: true }).eq("id", announced.cursoId);
    await manager.client.from("aprendizaje_cursos").update({ anunciar_proximamente: true }).eq("id", published.cursoId);

    const { data, error } = await learner.client.rpc("aprendizaje_proximamente");
    expect(error).toBeNull();
    const ids = (data as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(announced.cursoId);
    expect(ids).not.toContain(hidden.cursoId);
    expect(ids).not.toContain(published.cursoId);
    expect(Object.keys((data as Record<string, unknown>[])[0]).sort()).toEqual(["category", "description", "id", "title"]);

    // Still no access to the draft itself.
    const { data: rows } = await learner.client.from("aprendizaje_cursos").select("id").eq("id", announced.cursoId);
    expect(rows).toEqual([]);
  });
```

- [ ] **Step 2: Run after the migration is applied** — `bun x vitest run src/test/integration/aprendizajeRls.test.ts` — Expected: 8 passed. Commit: `git commit -am "test(aprendizaje): Próximamente RPC exposes only announced drafts' teaser"`.

---

### Task 9: Verification

- [ ] `bun x vitest run src/lib/aprendizaje "src/app/(app)/aprendizaje"` — all pass.
- [ ] `bun x tsc --noEmit -p .`, `bun x eslint src/lib/aprendizaje "src/app/(app)/aprendizaje"` — clean.
- [ ] `bun --bun next build` — compiles.
- [ ] After the user applies the migration: Task 8 + the evaluation integration tests pass; then push + deploy on the user's go-ahead.
