# Aprendizaje — Fase 3 (Evaluaciones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Courses can have a final evaluation built from a question bank. Each learner gets N random questions with shuffled options, the server grades the attempt, and a course with an evaluation is only completed once an attempt passes.

**Architecture:** Three new tables (`aprendizaje_preguntas`, `aprendizaje_opciones`, `aprendizaje_intentos`) plus three `eval_*` columns on `aprendizaje_cursos`. Learners have **no** direct access to questions/options. They start an attempt with the `aprendizaje_iniciar_intento` RPC, which draws and freezes the questions, read them through `aprendizaje_preguntas_intento`, which strips `is_correct`, and submit through `aprendizaje_enviar_intento`, which grades and recalculates completion. Pure rules (validation, availability, attempt summary) live in `src/lib/aprendizaje/evaluacion.ts`. The manager UI is a new "Evaluación" section in the existing course editor.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + `security definer` plpgsql), Vitest + Testing Library, Bun.

**Spec:** `docs/superpowers/specs/2026-11-25-aprendizaje-design.md` (Fase 3). Built before Fase 2 at the user's request (2026-11-25: "las preguntas no están, no las veo"). Out of scope here: resetting a person's attempts from the UI (needs Fase 2's per-person report; RLS already lets managers delete attempts).

**Conventions:** same as Fase 1 (`docs/superpowers/plans/2026-11-25-aprendizaje-fase-1-cursos.md`): tools via `bun x …`; `"use server"` files only export async functions; actions return `{ error?: string }`; internal links use `next/link`. Migrations are applied by the user pasting them into the Supabase SQL Editor of the **production project (`yeblzz…`)**, which `.env.local` now points to.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261125120000_aprendizaje_evaluaciones.sql` | Tables, RLS, RPCs, completion rule update |
| `src/lib/aprendizaje/evaluacion.ts` (+ test) | Evaluation types, validation, availability, attempt summary, row mapping |
| `src/lib/aprendizaje/types.ts`, `mapCurso.ts` (+ test) | `EvalSettings` on `CursoDetail` |
| `src/app/(app)/aprendizaje/actions.ts` | Learner: attempt state, start, read, submit |
| `src/app/(app)/aprendizaje/gestion/actions.ts` | Manager: settings, question CRUD, publish check |
| `src/app/(app)/aprendizaje/[cursoId]/EvaluacionCard.tsx`, `CursoViewer.tsx`, `page.tsx` | Evaluation card in the course |
| `src/app/(app)/aprendizaje/[cursoId]/evaluacion/[intentoId]/page.tsx`, `EvaluacionForm.tsx` (+ test) | Taking an attempt |
| `src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.tsx`, `EvaluacionEditor.tsx` (+ tests), `CursoEditor.tsx`, `page.tsx` | Manager evaluation section |
| `src/test/integration/aprendizajeEvaluaciones.test.ts` | RLS + RPC integration tests |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20261125120000_aprendizaje_evaluaciones.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Fase 3 of Aprendizaje: evaluations drawn from a per-course question bank.
-- Learners never read questions/options directly (they would see
-- is_correct): the drawn questions come from aprendizaje_preguntas_intento,
-- which strips the answers, and grading happens server-side in
-- aprendizaje_enviar_intento.

-- eval_questions_per_attempt null = the course has no evaluation.
alter table public.aprendizaje_cursos
  add column eval_questions_per_attempt int check (eval_questions_per_attempt > 0),
  add column eval_passing_score int not null default 70 check (eval_passing_score between 1 and 100),
  add column eval_max_attempts int check (eval_max_attempts > 0);

create table public.aprendizaje_preguntas (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  type text not null check (type in ('opcion_unica', 'verdadero_falso')),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index aprendizaje_preguntas_curso_idx on public.aprendizaje_preguntas (curso_id);

create table public.aprendizaje_opciones (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references public.aprendizaje_preguntas (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  is_correct boolean not null default false,
  position int not null default 0
);

create index aprendizaje_opciones_pregunta_idx on public.aprendizaje_opciones (pregunta_id);

create table public.aprendizaje_intentos (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.aprendizaje_cursos (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- [{ "pregunta_id": uuid, "option_ids": [uuid, ...] }] in the order shown.
  questions jsonb not null,
  -- { "<pregunta_id>": "<option_id>" }
  answers jsonb,
  score int,
  passed boolean
);

create index aprendizaje_intentos_curso_user_idx on public.aprendizaje_intentos (curso_id, app_user_id);
-- At most one open (unsubmitted) attempt per person and course.
create unique index aprendizaje_intentos_one_open_idx
  on public.aprendizaje_intentos (curso_id, app_user_id) where submitted_at is null;

alter table public.aprendizaje_preguntas enable row level security;
alter table public.aprendizaje_opciones enable row level security;
alter table public.aprendizaje_intentos enable row level security;

create policy "aprendizaje_preguntas_manage" on public.aprendizaje_preguntas
  for all using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());
create policy "aprendizaje_opciones_manage" on public.aprendizaje_opciones
  for all using (public.aprendizaje_can_manage()) with check (public.aprendizaje_can_manage());

create policy "aprendizaje_intentos_select" on public.aprendizaje_intentos
  for select using (app_user_id = auth.uid() or public.aprendizaje_can_manage());
-- Managers may delete attempts (to give someone extra tries); nobody writes them directly.
create policy "aprendizaje_intentos_delete" on public.aprendizaje_intentos
  for delete using (public.aprendizaje_can_manage());

-- A course with an evaluation is complete only once an attempt has passed.
create or replace function public.aprendizaje_recalcular_completitud(p_curso_id uuid, p_app_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_done int;
  v_has_eval boolean;
  v_passed boolean;
begin
  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = p_app_user_id;
  select eval_questions_per_attempt is not null into v_has_eval from aprendizaje_cursos where id = p_curso_id;
  select exists (
    select 1 from aprendizaje_intentos
    where curso_id = p_curso_id and app_user_id = p_app_user_id and passed
  ) into v_passed;

  if v_total > 0 and v_done >= v_total and (not coalesce(v_has_eval, false) or v_passed) then
    update aprendizaje_inscripciones
    set completed_at = now()
    where curso_id = p_curso_id and app_user_id = p_app_user_id and completed_at is null;
  end if;
end;
$$;

revoke execute on function public.aprendizaje_recalcular_completitud(uuid, uuid) from public, anon, authenticated;

-- Returns the open attempt if there is one (same draw, never re-drawn);
-- otherwise validates and draws a new one.
create or replace function public.aprendizaje_iniciar_intento(p_curso_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_curso aprendizaje_cursos%rowtype;
  v_open uuid;
  v_total int;
  v_done int;
  v_used int;
  v_questions jsonb;
begin
  if v_user is null or not public.aprendizaje_can_view() then
    raise exception 'No autorizado';
  end if;

  select * into v_curso from aprendizaje_cursos where id = p_curso_id;
  if not found or v_curso.status <> 'publicado' then
    raise exception 'El curso no está publicado';
  end if;
  if v_curso.eval_questions_per_attempt is null then
    raise exception 'Este curso no tiene evaluación';
  end if;

  select id into v_open
  from aprendizaje_intentos
  where curso_id = p_curso_id and app_user_id = v_user and submitted_at is null;
  if v_open is not null then
    return v_open;
  end if;

  if exists (select 1 from aprendizaje_intentos where curso_id = p_curso_id and app_user_id = v_user and passed) then
    raise exception 'Ya aprobaste esta evaluación';
  end if;

  select count(*) into v_total from aprendizaje_lecciones where curso_id = p_curso_id;
  select count(*) into v_done
  from aprendizaje_progreso_lecciones p
  join aprendizaje_lecciones l on l.id = p.leccion_id
  where l.curso_id = p_curso_id and p.app_user_id = v_user;
  if v_done < v_total then
    raise exception 'Primero completa todas las lecciones';
  end if;

  select count(*) into v_used from aprendizaje_intentos where curso_id = p_curso_id and app_user_id = v_user;
  if v_curso.eval_max_attempts is not null and v_used >= v_curso.eval_max_attempts then
    raise exception 'Ya usaste todos tus intentos';
  end if;

  -- Random questions in random order; options shuffled too, except
  -- Verdadero/Falso, which keep their natural order.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'pregunta_id', q.id,
             'option_ids', (
               select coalesce(jsonb_agg(o.id order by
                        case when q.type = 'verdadero_falso' then o.position::float8 else random() end), '[]'::jsonb)
               from aprendizaje_opciones o
               where o.pregunta_id = q.id
             )
           ) order by q.rn), '[]'::jsonb)
  into v_questions
  from (
    select id, type, row_number() over (order by random()) as rn
    from aprendizaje_preguntas
    where curso_id = p_curso_id and active
  ) q
  where q.rn <= v_curso.eval_questions_per_attempt;

  if jsonb_array_length(v_questions) = 0 then
    raise exception 'La evaluación todavía no tiene preguntas';
  end if;

  insert into aprendizaje_inscripciones (curso_id, app_user_id)
  values (p_curso_id, v_user)
  on conflict do nothing;

  insert into aprendizaje_intentos (curso_id, app_user_id, questions)
  values (p_curso_id, v_user, v_questions)
  returning id into v_open;

  return v_open;
end;
$$;

revoke execute on function public.aprendizaje_iniciar_intento(uuid) from public, anon;
grant execute on function public.aprendizaje_iniciar_intento(uuid) to authenticated;

-- The attempt's questions for its owner, WITHOUT is_correct.
create or replace function public.aprendizaje_preguntas_intento(p_intento_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_questions jsonb;
begin
  select questions into v_questions
  from aprendizaje_intentos
  where id = p_intento_id and app_user_id = auth.uid();
  if v_questions is null then
    raise exception 'Intento no encontrado';
  end if;

  return (
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'text', p.text,
               'type', p.type,
               'options', (
                 select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by oo.ord), '[]'::jsonb)
                 from jsonb_array_elements_text(q.value -> 'option_ids') with ordinality as oo(option_id, ord)
                 join aprendizaje_opciones o on o.id::text = oo.option_id
               )
             ) order by q.ord), '[]'::jsonb)
    from jsonb_array_elements(v_questions) with ordinality as q(value, ord)
    join aprendizaje_preguntas p on p.id::text = q.value ->> 'pregunta_id'
  );
end;
$$;

revoke execute on function public.aprendizaje_preguntas_intento(uuid) from public, anon;
grant execute on function public.aprendizaje_preguntas_intento(uuid) to authenticated;

-- Grades the attempt (score = floor(correct / total * 100)), records it and
-- recalculates completion. Questions deleted after the draw don't count.
create or replace function public.aprendizaje_enviar_intento(p_intento_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intento aprendizaje_intentos%rowtype;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_passing int;
  v_total int;
  v_correct int;
  v_score int;
  v_passed boolean;
begin
  select * into v_intento
  from aprendizaje_intentos
  where id = p_intento_id and app_user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Intento no encontrado';
  end if;
  if v_intento.submitted_at is not null then
    raise exception 'Este intento ya fue enviado';
  end if;

  select eval_passing_score into v_passing from aprendizaje_cursos where id = v_intento.curso_id;

  select count(*), count(*) filter (where o.is_correct)
  into v_total, v_correct
  from jsonb_array_elements(v_intento.questions) as q(value)
  join aprendizaje_preguntas p on p.id::text = q.value ->> 'pregunta_id'
  left join aprendizaje_opciones o
    on o.pregunta_id = p.id and o.id::text = v_answers ->> p.id::text;

  v_score := case when v_total = 0 then 0 else floor(v_correct * 100.0 / v_total)::int end;
  v_passed := v_total > 0 and v_score >= v_passing;

  update aprendizaje_intentos
  set submitted_at = now(), answers = v_answers, score = v_score, passed = v_passed
  where id = p_intento_id;

  perform public.aprendizaje_recalcular_completitud(v_intento.curso_id, v_intento.app_user_id);

  return jsonb_build_object('score', v_score, 'passed', v_passed, 'correct', v_correct, 'total', v_total);
end;
$$;

revoke execute on function public.aprendizaje_enviar_intento(uuid, jsonb) from public, anon;
grant execute on function public.aprendizaje_enviar_intento(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261125120000_aprendizaje_evaluaciones.sql
git commit -m "feat(aprendizaje): question bank, attempts and grading RPCs"
```

---

### Task 2: Evaluation rules library

**Files:**
- Modify: `src/lib/aprendizaje/types.ts`
- Create: `src/lib/aprendizaje/evaluacion.ts`
- Test: `src/lib/aprendizaje/evaluacion.test.ts`

- [ ] **Step 1: `types.ts`** — add before `export interface CursoDetail`:

```ts
/** A course's evaluation settings. questionsPerAttempt null = no evaluation. */
export interface EvalSettings {
  questionsPerAttempt: number | null;
  passingScore: number;
  maxAttempts: number | null;
}
```

and add `evaluacion: EvalSettings;` as the last field of `CursoDetail` (after `completedAt`).

- [ ] **Step 2: Write the failing tests `evaluacion.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  evaluacionDisponibilidad,
  summarizeIntentos,
  toPreguntaGestion,
  validateEvalSettings,
  validatePregunta,
  type PreguntaInput,
} from "./evaluacion";

const opcionUnica = (overrides: Partial<PreguntaInput> = {}): PreguntaInput => ({
  text: "¿Capital de RD?",
  type: "opcion_unica",
  options: [
    { text: "Santo Domingo", isCorrect: true },
    { text: "Santiago", isCorrect: false },
  ],
  ...overrides,
});

describe("validatePregunta", () => {
  it("accepts a valid single-choice and true/false question", () => {
    expect(validatePregunta(opcionUnica())).toBeNull();
    expect(
      validatePregunta({
        text: "El sol es una estrella",
        type: "verdadero_falso",
        options: [
          { text: "Verdadero", isCorrect: true },
          { text: "Falso", isCorrect: false },
        ],
      }),
    ).toBeNull();
  });

  it.each<[string, PreguntaInput, string]>([
    ["empty text", opcionUnica({ text: "  " }), "Escribe la pregunta."],
    ["one option", opcionUnica({ options: [{ text: "A", isCorrect: true }] }), "Agrega al menos dos opciones."],
    [
      "an empty option",
      opcionUnica({ options: [{ text: "A", isCorrect: true }, { text: " ", isCorrect: false }] }),
      "Las opciones no pueden estar vacías.",
    ],
    [
      "no correct option",
      opcionUnica({ options: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: false }] }),
      "Marca exactamente una opción correcta.",
    ],
    [
      "two correct options",
      opcionUnica({ options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }] }),
      "Marca exactamente una opción correcta.",
    ],
    [
      "true/false without an answer",
      {
        text: "X",
        type: "verdadero_falso",
        options: [
          { text: "Verdadero", isCorrect: false },
          { text: "Falso", isCorrect: false },
        ],
      },
      "Marca si la respuesta correcta es Verdadero o Falso.",
    ],
  ])("rejects %s", (_label, input, error) => {
    expect(validatePregunta(input)).toBe(error);
  });
});

describe("validateEvalSettings", () => {
  it("accepts valid settings, including no evaluation and unlimited attempts", () => {
    expect(validateEvalSettings({ questionsPerAttempt: 10, passingScore: 70, maxAttempts: 3 })).toBeNull();
    expect(validateEvalSettings({ questionsPerAttempt: null, passingScore: 70, maxAttempts: null })).toBeNull();
  });

  it.each<[Parameters<typeof validateEvalSettings>[0], string]>([
    [{ questionsPerAttempt: 0, passingScore: 70, maxAttempts: null }, "Las preguntas por persona deben ser un número mayor a 0."],
    [{ questionsPerAttempt: 2.5, passingScore: 70, maxAttempts: null }, "Las preguntas por persona deben ser un número mayor a 0."],
    [{ questionsPerAttempt: 5, passingScore: 0, maxAttempts: null }, "La nota mínima debe estar entre 1 y 100."],
    [{ questionsPerAttempt: 5, passingScore: 101, maxAttempts: null }, "La nota mínima debe estar entre 1 y 100."],
    [
      { questionsPerAttempt: 5, passingScore: 70, maxAttempts: 0 },
      "Los intentos deben ser un número mayor a 0 (o vacío para ilimitados).",
    ],
  ])("rejects %j", (settings, error) => {
    expect(validateEvalSettings(settings)).toBe(error);
  });
});

describe("summarizeIntentos", () => {
  it("counts attempts, finds the open one, the best score and whether any passed", () => {
    expect(
      summarizeIntentos([
        { id: "a", submitted_at: "2026-11-25T10:00:00Z", score: 40, passed: false },
        { id: "b", submitted_at: "2026-11-25T11:00:00Z", score: 80, passed: true },
        { id: "c", submitted_at: null, score: null, passed: null },
      ]),
    ).toEqual({ attemptsUsed: 3, passed: true, bestScore: 80, openIntentoId: "c" });
    expect(summarizeIntentos([])).toEqual({ attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null });
  });
});

describe("evaluacionDisponibilidad", () => {
  const settings = { questionsPerAttempt: 5, passingScore: 70, maxAttempts: 2 };
  const fresh = { attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null };

  it("offers the first attempt once lessons are done", () => {
    expect(evaluacionDisponibilidad(settings, fresh, true)).toEqual({ canStart: true, label: "Tomar evaluación", reason: null });
  });

  it("requires all lessons first", () => {
    expect(evaluacionDisponibilidad(settings, fresh, false)).toMatchObject({
      canStart: false,
      reason: "Completa todas las lecciones para habilitar la evaluación.",
    });
  });

  it("resumes an open attempt", () => {
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 1, openIntentoId: "x" }, true)).toMatchObject({
      canStart: true,
      label: "Continuar evaluación",
    });
  });

  it("offers a retry until attempts run out", () => {
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 1, bestScore: 40 }, true)).toMatchObject({
      canStart: true,
      label: "Intentar de nuevo",
    });
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 2, bestScore: 40 }, true)).toMatchObject({
      canStart: false,
      reason: "Usaste todos tus intentos. Consulta con el área responsable.",
    });
    expect(
      evaluacionDisponibilidad({ ...settings, maxAttempts: null }, { ...fresh, attemptsUsed: 9 }, true).canStart,
    ).toBe(true);
  });

  it("stops once passed", () => {
    expect(evaluacionDisponibilidad(settings, { ...fresh, attemptsUsed: 1, passed: true, bestScore: 90 }, true)).toMatchObject({
      canStart: false,
      reason: "Aprobaste la evaluación.",
    });
  });
});

describe("toPreguntaGestion", () => {
  it("maps and sorts options by position", () => {
    expect(
      toPreguntaGestion({
        id: "p1",
        text: "¿?",
        type: "opcion_unica",
        active: true,
        aprendizaje_opciones: [
          { id: "o2", text: "B", is_correct: false, position: 1 },
          { id: "o1", text: "A", is_correct: true, position: 0 },
        ],
      }),
    ).toEqual({
      id: "p1",
      text: "¿?",
      type: "opcion_unica",
      active: true,
      options: [
        { id: "o1", text: "A", isCorrect: true },
        { id: "o2", text: "B", isCorrect: false },
      ],
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun x vitest run src/lib/aprendizaje/evaluacion.test.ts` — Expected: FAIL (cannot resolve `./evaluacion`).

- [ ] **Step 4: Implement `evaluacion.ts`**

```ts
import type { EvalSettings } from "./types";

export type PreguntaType = "opcion_unica" | "verdadero_falso";

export const PREGUNTA_TYPE_LABELS: Record<PreguntaType, string> = {
  opcion_unica: "Selección múltiple",
  verdadero_falso: "Verdadero o falso",
};

export const TRUE_FALSE_TEXTS = ["Verdadero", "Falso"] as const;

export interface OpcionInput {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface PreguntaInput {
  id?: string;
  text: string;
  type: PreguntaType;
  options: OpcionInput[];
}

/** A bank question as the manager sees it (with the correct answer). */
export interface PreguntaGestion {
  id: string;
  text: string;
  type: PreguntaType;
  active: boolean;
  options: { id: string; text: string; isCorrect: boolean }[];
}

/** A drawn question as the learner sees it (never includes the answer). */
export interface PreguntaIntento {
  id: string;
  text: string;
  type: PreguntaType;
  options: { id: string; text: string }[];
}

export interface IntentoResultado {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
}

export interface IntentoDetail {
  id: string;
  cursoId: string;
  submitted: boolean;
  score: number | null;
  passed: boolean | null;
  preguntas: PreguntaIntento[];
}

export interface EvaluacionEstado {
  attemptsUsed: number;
  passed: boolean;
  bestScore: number | null;
  openIntentoId: string | null;
}

export interface RawPregunta {
  id: string;
  text: string;
  type: PreguntaType;
  active: boolean;
  aprendizaje_opciones?: { id: string; text: string; is_correct: boolean; position: number }[] | null;
}

export function validatePregunta(input: PreguntaInput): string | null {
  if (!input.text.trim()) return "Escribe la pregunta.";
  const correct = input.options.filter((o) => o.isCorrect).length;
  if (input.type === "verdadero_falso") {
    return input.options.length === 2 && correct === 1 ? null : "Marca si la respuesta correcta es Verdadero o Falso.";
  }
  if (input.options.length < 2) return "Agrega al menos dos opciones.";
  if (input.options.some((o) => !o.text.trim())) return "Las opciones no pueden estar vacías.";
  if (correct !== 1) return "Marca exactamente una opción correcta.";
  return null;
}

const isPositiveInt = (n: number) => Number.isInteger(n) && n > 0;

export function validateEvalSettings(settings: EvalSettings): string | null {
  if (settings.questionsPerAttempt !== null && !isPositiveInt(settings.questionsPerAttempt)) {
    return "Las preguntas por persona deben ser un número mayor a 0.";
  }
  if (!Number.isInteger(settings.passingScore) || settings.passingScore < 1 || settings.passingScore > 100) {
    return "La nota mínima debe estar entre 1 y 100.";
  }
  if (settings.maxAttempts !== null && !isPositiveInt(settings.maxAttempts)) {
    return "Los intentos deben ser un número mayor a 0 (o vacío para ilimitados).";
  }
  return null;
}

export function summarizeIntentos(
  rows: { id: string; submitted_at: string | null; score: number | null; passed: boolean | null }[],
): EvaluacionEstado {
  const submitted = rows.filter((r) => r.submitted_at !== null);
  const scores = submitted.map((r) => r.score ?? 0);
  return {
    attemptsUsed: rows.length,
    passed: submitted.some((r) => r.passed === true),
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    openIntentoId: rows.find((r) => r.submitted_at === null)?.id ?? null,
  };
}

/** Mirrors the checks in aprendizaje_iniciar_intento so the UI explains why it can't start. */
export function evaluacionDisponibilidad(
  settings: EvalSettings,
  estado: EvaluacionEstado,
  lessonsDone: boolean,
): { canStart: boolean; label: string; reason: string | null } {
  if (estado.passed) return { canStart: false, label: "", reason: "Aprobaste la evaluación." };
  if (estado.openIntentoId) return { canStart: true, label: "Continuar evaluación", reason: null };
  if (!lessonsDone) {
    return { canStart: false, label: "", reason: "Completa todas las lecciones para habilitar la evaluación." };
  }
  if (settings.maxAttempts !== null && estado.attemptsUsed >= settings.maxAttempts) {
    return { canStart: false, label: "", reason: "Usaste todos tus intentos. Consulta con el área responsable." };
  }
  return { canStart: true, label: estado.attemptsUsed > 0 ? "Intentar de nuevo" : "Tomar evaluación", reason: null };
}

export function toPreguntaGestion(raw: RawPregunta): PreguntaGestion {
  return {
    id: raw.id,
    text: raw.text,
    type: raw.type,
    active: raw.active,
    options: [...(raw.aprendizaje_opciones ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun x vitest run src/lib/aprendizaje/evaluacion.test.ts` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/aprendizaje/types.ts src/lib/aprendizaje/evaluacion.ts src/lib/aprendizaje/evaluacion.test.ts
git commit -m "feat(aprendizaje): evaluation rules (validation, availability, attempt summary)"
```

---

### Task 3: `CursoDetail.evaluacion` mapping

**Files:**
- Modify: `src/lib/aprendizaje/mapCurso.ts`, `src/lib/aprendizaje/mapCurso.test.ts`
- Modify: test fixtures in `src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx` and `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.test.tsx`

- [ ] **Step 1: Failing test** — append to the `toCursoDetail` describe in `mapCurso.test.ts`:

```ts
  it("maps the evaluation settings, defaulting to no evaluation", () => {
    expect(toCursoDetail(RAW, new Set(), null).evaluacion).toEqual({
      questionsPerAttempt: null,
      passingScore: 70,
      maxAttempts: null,
    });
    expect(
      toCursoDetail({ ...RAW, eval_questions_per_attempt: 10, eval_passing_score: 80, eval_max_attempts: 3 }, new Set(), null)
        .evaluacion,
    ).toEqual({ questionsPerAttempt: 10, passingScore: 80, maxAttempts: 3 });
  });
```

Run: `bun x vitest run src/lib/aprendizaje/mapCurso.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement** — in `mapCurso.ts`, add to `RawCurso` (after `updated_at?: string;`):

```ts
  eval_questions_per_attempt?: number | null;
  eval_passing_score?: number | null;
  eval_max_attempts?: number | null;
```

and in `toCursoDetail`'s returned object, after `completedAt,`:

```ts
    evaluacion: {
      questionsPerAttempt: raw.eval_questions_per_attempt ?? null,
      passingScore: raw.eval_passing_score ?? 70,
      maxAttempts: raw.eval_max_attempts ?? null,
    },
```

- [ ] **Step 3: Fixtures** — in both `CursoViewer.test.tsx` and `CursoEditor.test.tsx`, add to the `CURSO` object (after `completedAt: null,`):

```ts
  evaluacion: { questionsPerAttempt: null, passingScore: 70, maxAttempts: null },
```

- [ ] **Step 4: Select the columns** — in both `src/app/(app)/aprendizaje/actions.ts` and `src/app/(app)/aprendizaje/gestion/actions.ts`, change the first line of `CURSO_DETAIL_SELECT` to:

```ts
  "id, title, description, category, status, cover_drive_id, cover_item_id, updated_at, eval_questions_per_attempt, eval_passing_score, eval_max_attempts, " +
```

- [ ] **Step 5: Verify and commit**

Run: `bun x vitest run src/lib/aprendizaje "src/app/(app)/aprendizaje"` and `bun x tsc --noEmit -p .` — Expected: all pass, no type errors.

```bash
git add src/lib/aprendizaje "src/app/(app)/aprendizaje"
git commit -m "feat(aprendizaje): expose evaluation settings on CursoDetail"
```

---

### Task 4: Learner actions

**Files:**
- Modify: `src/app/(app)/aprendizaje/actions.ts`

- [ ] **Step 1: Add imports** (with the other imports):

```ts
import {
  summarizeIntentos,
  type EvaluacionEstado,
  type IntentoDetail,
  type IntentoResultado,
  type PreguntaIntento,
} from "@/lib/aprendizaje/evaluacion";
```

- [ ] **Step 2: Append the actions**

```ts
export async function getEvaluacionEstado(cursoId: string): Promise<EvaluacionEstado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return summarizeIntentos([]);
  // Filter by user explicitly: managers can read everyone's attempts.
  const { data } = await supabase
    .from("aprendizaje_intentos")
    .select("id, submitted_at, score, passed")
    .eq("curso_id", cursoId)
    .eq("app_user_id", user.id);
  return summarizeIntentos(data ?? []);
}

export async function iniciarIntento(cursoId: string): Promise<{ intentoId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
  if (error) return { error: error.message };
  revalidatePath(`/aprendizaje/${cursoId}`);
  return { intentoId: data as string };
}

export async function getIntento(intentoId: string): Promise<IntentoDetail | null> {
  const supabase = await createClient();
  const { data: intento } = await supabase
    .from("aprendizaje_intentos")
    .select("id, curso_id, submitted_at, score, passed")
    .eq("id", intentoId)
    .maybeSingle();
  if (!intento) return null;
  const { data: preguntas, error } = await supabase.rpc("aprendizaje_preguntas_intento", { p_intento_id: intentoId });
  if (error) return null;
  return {
    id: intento.id,
    cursoId: intento.curso_id,
    submitted: intento.submitted_at !== null,
    score: intento.score,
    passed: intento.passed,
    preguntas: (preguntas ?? []) as PreguntaIntento[],
  };
}

export async function enviarIntento(
  intentoId: string,
  cursoId: string,
  answers: Record<string, string>,
): Promise<{ resultado?: IntentoResultado; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aprendizaje_enviar_intento", {
    p_intento_id: intentoId,
    p_answers: answers,
  });
  if (error) return { error: error.message };
  revalidatePath(`/aprendizaje/${cursoId}`);
  revalidatePath("/aprendizaje");
  return { resultado: data as IntentoResultado };
}
```

- [ ] **Step 3: Verify and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/actions.ts"` — Expected: clean.

```bash
git add "src/app/(app)/aprendizaje/actions.ts"
git commit -m "feat(aprendizaje): learner actions to start, read and submit attempts"
```

---

### Task 5: Manager actions

**Files:**
- Modify: `src/app/(app)/aprendizaje/gestion/actions.ts`

- [ ] **Step 1: Add imports**

```ts
import {
  toPreguntaGestion,
  validateEvalSettings,
  validatePregunta,
  type PreguntaGestion,
  type PreguntaInput,
  type RawPregunta,
} from "@/lib/aprendizaje/evaluacion";
```

and add `EvalSettings` to the existing `@/lib/aprendizaje/types` type import.

- [ ] **Step 2: Publish check** — in `setCursoStatus`, replace the `if (status === "publicado") { … }` block with:

```ts
  if (status === "publicado") {
    const { count } = await ctx.supabase
      .from("aprendizaje_lecciones")
      .select("id", { count: "exact", head: true })
      .eq("curso_id", cursoId);
    if (!count) return { error: "Agrega al menos una lección antes de publicar." };

    const noQuestions = await evaluationWithoutQuestions(ctx.supabase, cursoId);
    if (noQuestions) return { error: noQuestions };
  }
```

- [ ] **Step 3: Append the helper and the evaluation actions**

```ts
/** An enabled evaluation needs at least one active question, or nobody could ever complete the course. */
async function evaluationWithoutQuestions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cursoId: string,
  questionsPerAttempt?: number | null,
): Promise<string | null> {
  let enabled = questionsPerAttempt !== undefined ? questionsPerAttempt !== null : false;
  if (questionsPerAttempt === undefined) {
    const { data } = await supabase.from("aprendizaje_cursos").select("eval_questions_per_attempt").eq("id", cursoId).maybeSingle();
    enabled = data?.eval_questions_per_attempt != null;
  }
  if (!enabled) return null;
  const { count } = await supabase
    .from("aprendizaje_preguntas")
    .select("id", { count: "exact", head: true })
    .eq("curso_id", cursoId)
    .eq("active", true);
  return count ? null : "La evaluación no tiene preguntas activas. Agrégalas o desactiva la evaluación.";
}

export async function listPreguntas(cursoId: string): Promise<PreguntaGestion[]> {
  const ctx = await managerClient();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from("aprendizaje_preguntas")
    .select("id, text, type, active, position, created_at, aprendizaje_opciones(id, text, is_correct, position)")
    .eq("curso_id", cursoId)
    .order("position")
    .order("created_at");
  return ((data ?? []) as unknown as RawPregunta[]).map(toPreguntaGestion);
}

export async function updateEvalSettings(cursoId: string, settings: EvalSettings): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const invalid = validateEvalSettings(settings);
  if (invalid) return { error: invalid };

  const { data: curso } = await ctx.supabase.from("aprendizaje_cursos").select("status").eq("id", cursoId).maybeSingle();
  if (!curso) return { error: "Curso no encontrado." };
  if (curso.status === "publicado") {
    const noQuestions = await evaluationWithoutQuestions(ctx.supabase, cursoId, settings.questionsPerAttempt);
    if (noQuestions) return { error: noQuestions };
  }

  const { error } = await ctx.supabase
    .from("aprendizaje_cursos")
    .update({
      eval_questions_per_attempt: settings.questionsPerAttempt,
      eval_passing_score: settings.passingScore,
      eval_max_attempts: settings.maxAttempts,
    })
    .eq("id", cursoId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

/** Creates or updates a question. Options keep their ids so open attempts still resolve them. */
export async function savePregunta(cursoId: string, input: PreguntaInput): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const invalid = validatePregunta(input);
  if (invalid) return { error: invalid };

  let preguntaId = input.id;
  if (preguntaId) {
    const { error } = await ctx.supabase
      .from("aprendizaje_preguntas")
      .update({ text: input.text.trim(), type: input.type })
      .eq("id", preguntaId)
      .eq("curso_id", cursoId);
    if (error) return { error: error.message };
  } else {
    const { count } = await ctx.supabase
      .from("aprendizaje_preguntas")
      .select("id", { count: "exact", head: true })
      .eq("curso_id", cursoId);
    const { data, error } = await ctx.supabase
      .from("aprendizaje_preguntas")
      .insert({ curso_id: cursoId, text: input.text.trim(), type: input.type, position: count ?? 0 })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "No se pudo guardar la pregunta." };
    preguntaId = data.id as string;
  }

  const keepIds = input.options.flatMap((o) => (o.id ? [o.id] : []));
  const { data: existing } = await ctx.supabase.from("aprendizaje_opciones").select("id").eq("pregunta_id", preguntaId);
  const removed = (existing ?? []).map((o) => o.id as string).filter((id) => !keepIds.includes(id));
  if (removed.length > 0) {
    const { error } = await ctx.supabase.from("aprendizaje_opciones").delete().in("id", removed);
    if (error) return { error: error.message };
  }

  for (const [position, option] of input.options.entries()) {
    const row = { text: option.text.trim(), is_correct: option.isCorrect, position };
    const { error } = option.id
      ? await ctx.supabase.from("aprendizaje_opciones").update(row).eq("id", option.id).eq("pregunta_id", preguntaId)
      : await ctx.supabase.from("aprendizaje_opciones").insert({ ...row, pregunta_id: preguntaId });
    if (error) return { error: error.message };
  }

  revalidateCurso(cursoId);
  return {};
}

export async function setPreguntaActiva(preguntaId: string, cursoId: string, active: boolean): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_preguntas").update({ active }).eq("id", preguntaId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}

export async function deletePregunta(preguntaId: string, cursoId: string): Promise<ActionResult> {
  const ctx = await managerClient();
  if (!ctx) return { error: "No autorizado" };
  const { error } = await ctx.supabase.from("aprendizaje_preguntas").delete().eq("id", preguntaId);
  if (error) return { error: error.message };
  revalidateCurso(cursoId);
  return {};
}
```

- [ ] **Step 4: Verify and commit**

Run: `bun x tsc --noEmit -p .` and `bun x eslint "src/app/(app)/aprendizaje/gestion/actions.ts"` — Expected: clean.

```bash
git add "src/app/(app)/aprendizaje/gestion/actions.ts"
git commit -m "feat(aprendizaje): manager actions for evaluation settings and question bank"
```

---

### Task 6: Evaluation card in the course

**Files:**
- Create: `src/app/(app)/aprendizaje/[cursoId]/EvaluacionCard.tsx`
- Modify: `src/app/(app)/aprendizaje/[cursoId]/CursoViewer.tsx`, `src/app/(app)/aprendizaje/[cursoId]/page.tsx`, `src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx`

- [ ] **Step 1: Failing test** — in `CursoViewer.test.tsx`:
  - extend the actions mock to `vi.mock("../actions", () => ({ marcarLeccionVista: (leccionId: string, cursoId: string) => marcarLeccionVista(leccionId, cursoId), iniciarIntento: (cursoId: string) => iniciarIntento(cursoId) }));` and declare `const iniciarIntento = vi.fn();` and `const push = vi.fn();` next to `refresh`; make the router mock `useRouter: () => ({ refresh, push })`.
  - append:

```tsx
  describe("evaluation", () => {
    const withEval: CursoDetail = { ...CURSO, evaluacion: { questionsPerAttempt: 5, passingScore: 70, maxAttempts: 2 } };
    const estado = { attemptsUsed: 0, passed: false, bestScore: null, openIntentoId: null };
    const allSeen: CursoDetail = { ...withEval, lecciones: withEval.lecciones.map((l) => ({ ...l, completed: true })) };

    it("asks to finish the lessons first", () => {
      render(<CursoViewer curso={withEval} evaluacion={estado} />);
      expect(screen.getByText("Evaluación final")).toBeTruthy();
      expect(screen.getByText("Completa todas las lecciones para habilitar la evaluación.")).toBeTruthy();
    });

    it("starts an attempt and opens it", async () => {
      iniciarIntento.mockResolvedValue({ intentoId: "i1" });
      render(<CursoViewer curso={allSeen} evaluacion={estado} />);

      fireEvent.click(screen.getByRole("button", { name: "Tomar evaluación" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/aprendizaje/c1/evaluacion/i1"));
      expect(iniciarIntento).toHaveBeenCalledWith("c1");
    });

    it("hides the card when the course has no evaluation", () => {
      render(<CursoViewer curso={CURSO} evaluacion={null} />);
      expect(screen.queryByText("Evaluación final")).toBeNull();
    });
  });
```

Run: `bun x vitest run "src/app/(app)/aprendizaje/[cursoId]/CursoViewer.test.tsx"` — Expected: FAIL.

- [ ] **Step 2: `EvaluacionCard.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { evaluacionDisponibilidad, type EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";
import type { EvalSettings } from "@/lib/aprendizaje/types";
import { iniciarIntento } from "../actions";

export function EvaluacionCard({
  cursoId,
  settings,
  estado,
  lessonsDone,
  isPreview,
}: {
  cursoId: string;
  settings: EvalSettings;
  estado: EvaluacionEstado;
  lessonsDone: boolean;
  isPreview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const disponibilidad = evaluacionDisponibilidad(settings, estado, lessonsDone);
  const attempts =
    settings.maxAttempts === null
      ? "intentos ilimitados"
      : `${estado.attemptsUsed} de ${settings.maxAttempts} intentos usados`;

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await iniciarIntento(cursoId);
      if (result.error || !result.intentoId) {
        setError(result.error ?? "No se pudo iniciar la evaluación.");
        return;
      }
      router.push(`/aprendizaje/${cursoId}/evaluacion/${result.intentoId}`);
    });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="size-5 text-[#04B1AF]" />
        <h2 className="text-lg font-semibold">Evaluación final</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {settings.questionsPerAttempt} preguntas al azar · nota mínima {settings.passingScore}% · {attempts}
      </p>
      {estado.bestScore !== null && (
        <p className="text-sm">
          Tu mejor nota: <span className="font-semibold tabular-nums">{estado.bestScore}%</span>
        </p>
      )}
      {estado.passed ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          Aprobaste la evaluación.
        </p>
      ) : isPreview ? (
        <p className="text-sm text-muted-foreground">La evaluación se habilita cuando el curso esté publicado.</p>
      ) : disponibilidad.canStart ? (
        <Button onClick={start} disabled={isPending}>
          {disponibilidad.label}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{disponibilidad.reason}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 3: `CursoViewer.tsx`**
  1. Add imports: `import type { EvaluacionEstado } from "@/lib/aprendizaje/evaluacion";` and `import { EvaluacionCard } from "./EvaluacionCard";`.
  2. Change the signature to `export function CursoViewer({ curso, evaluacion = null }: { curso: CursoDetail; evaluacion?: EvaluacionEstado | null }) {`.
  3. Right before the component's final closing `</div>` (after the lessons grid `</div>`), add:

```tsx
      {curso.evaluacion.questionsPerAttempt !== null && evaluacion && (
        <EvaluacionCard
          cursoId={curso.id}
          settings={curso.evaluacion}
          estado={evaluacion}
          lessonsDone={curso.lecciones.length > 0 && done === curso.lecciones.length}
          isPreview={isPreview}
        />
      )}
```

- [ ] **Step 4: `[cursoId]/page.tsx`** — import `getEvaluacionEstado` from `../actions`, and after the `notFound()` check:

```tsx
  const evaluacion = curso.evaluacion.questionsPerAttempt !== null ? await getEvaluacionEstado(cursoId) : null;
```

and render `<CursoViewer curso={curso} evaluacion={evaluacion} />`.

- [ ] **Step 5: Verify and commit**

Run: `bun x vitest run "src/app/(app)/aprendizaje/[cursoId]"`, `bun x tsc --noEmit -p .`, `bun x eslint "src/app/(app)/aprendizaje/[cursoId]"` — Expected: all pass.

```bash
git add "src/app/(app)/aprendizaje/[cursoId]"
git commit -m "feat(aprendizaje): evaluation card in the course page"
```

---

### Task 7: Taking an attempt

**Files:**
- Create: `src/app/(app)/aprendizaje/[cursoId]/evaluacion/[intentoId]/EvaluacionForm.tsx`
- Create: `src/app/(app)/aprendizaje/[cursoId]/evaluacion/[intentoId]/page.tsx`
- Test: `src/app/(app)/aprendizaje/[cursoId]/evaluacion/[intentoId]/EvaluacionForm.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntentoDetail } from "@/lib/aprendizaje/evaluacion";

const enviarIntento = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../../actions", () => ({
  enviarIntento: (...args: unknown[]) => enviarIntento(...args),
}));

const { EvaluacionForm } = await import("./EvaluacionForm");

const INTENTO: IntentoDetail = {
  id: "i1",
  cursoId: "c1",
  submitted: false,
  score: null,
  passed: null,
  preguntas: [
    { id: "p1", text: "¿Capital de RD?", type: "opcion_unica", options: [{ id: "o1", text: "Santiago" }, { id: "o2", text: "Santo Domingo" }] },
    { id: "p2", text: "El agua hierve a 100 °C", type: "verdadero_falso", options: [{ id: "o3", text: "Verdadero" }, { id: "o4", text: "Falso" }] },
  ],
};

describe("EvaluacionForm", () => {
  beforeEach(() => enviarIntento.mockReset());

  it("only enables sending once every question is answered", () => {
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);
    const send = screen.getByRole("button", { name: "Enviar respuestas" }) as HTMLButtonElement;

    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Santo Domingo"));
    expect(screen.getByText("1 de 2 respondidas")).toBeTruthy();
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Verdadero"));
    expect(send.disabled).toBe(false);
  });

  it("submits the answers and shows a passing result", async () => {
    enviarIntento.mockResolvedValue({ resultado: { score: 100, passed: true, correct: 2, total: 2 } });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);

    fireEvent.click(screen.getByLabelText("Santo Domingo"));
    fireEvent.click(screen.getByLabelText("Verdadero"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    await waitFor(() => expect(enviarIntento).toHaveBeenCalledWith("i1", "c1", { p1: "o2", p2: "o3" }));
    expect(await screen.findByText("¡Aprobaste!")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText(/2 de 2 respuestas correctas/)).toBeTruthy();
  });

  it("shows a failing result", async () => {
    enviarIntento.mockResolvedValue({ resultado: { score: 50, passed: false, correct: 1, total: 2 } });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);

    fireEvent.click(screen.getByLabelText("Santiago"));
    fireEvent.click(screen.getByLabelText("Falso"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("No alcanzaste la nota mínima")).toBeTruthy();
  });

  it("shows the stored result for an attempt already submitted", () => {
    render(<EvaluacionForm cursoId="c1" intento={{ ...INTENTO, submitted: true, score: 80, passed: true }} passingScore={70} />);
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar respuestas" })).toBeNull();
  });

  it("shows a server error", async () => {
    enviarIntento.mockResolvedValue({ error: "Este intento ya fue enviado" });
    render(<EvaluacionForm cursoId="c1" intento={INTENTO} passingScore={70} />);
    fireEvent.click(screen.getByLabelText("Santo Domingo"));
    fireEvent.click(screen.getByLabelText("Verdadero"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    expect(await screen.findByText("Este intento ya fue enviado")).toBeTruthy();
  });
});
```

Run: `bun x vitest run "src/app/(app)/aprendizaje/[cursoId]/evaluacion"` — Expected: FAIL.

- [ ] **Step 2: `EvaluacionForm.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntentoDetail } from "@/lib/aprendizaje/evaluacion";
import { enviarIntento } from "../../../actions";

interface Resultado {
  score: number;
  passed: boolean;
  correct: number | null;
  total: number | null;
}

export function EvaluacionForm({
  cursoId,
  intento,
  passingScore,
}: {
  cursoId: string;
  intento: IntentoDetail;
  passingScore: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(
    intento.submitted ? { score: intento.score ?? 0, passed: Boolean(intento.passed), correct: null, total: null } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = intento.preguntas.length;
  const answered = intento.preguntas.filter((p) => answers[p.id]).length;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await enviarIntento(intento.id, cursoId, answers);
      if (result.error || !result.resultado) {
        setError(result.error ?? "No se pudo enviar la evaluación.");
        return;
      }
      setResultado(result.resultado);
      router.refresh();
    });
  }

  if (resultado) {
    return (
      <section className="space-y-3 rounded-xl border bg-card p-6 text-center shadow-sm">
        {resultado.passed ? (
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        ) : (
          <XCircle className="mx-auto size-12 text-destructive" />
        )}
        <p className="text-4xl font-bold tabular-nums">{resultado.score}%</p>
        <p className="text-lg font-semibold">{resultado.passed ? "¡Aprobaste!" : "No alcanzaste la nota mínima"}</p>
        <p className="text-sm text-muted-foreground">
          {resultado.correct !== null && `${resultado.correct} de ${resultado.total} respuestas correctas · `}
          nota mínima {passingScore}%
        </p>
        <Link
          href={`/aprendizaje/${cursoId}`}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Volver al curso
        </Link>
      </section>
    );
  }

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Esta evaluación no tiene preguntas disponibles.</p>;
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {intento.preguntas.map((p, i) => (
          <li key={p.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <p className="font-medium">
              {i + 1}. {p.text}
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Pregunta {i + 1}</legend>
              {p.options.map((o) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    answers[p.id] === o.id ? "border-[#04B1AF] bg-[#04B1AF]/5" : "hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name={`pregunta-${p.id}`}
                    value={o.id}
                    checked={answers[p.id] === o.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [p.id]: o.id }))}
                    className="accent-[#04B1AF]"
                  />
                  {o.text}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending || answered < total}>
          Enviar respuestas
        </Button>
        <span className="text-sm text-muted-foreground">
          {answered} de {total} respondidas
        </span>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { aprendizajeFlags, getCurso, getIntento } from "../../../actions";
import { EvaluacionForm } from "./EvaluacionForm";

export default async function EvaluacionPage({
  params,
}: {
  params: Promise<{ cursoId: string; intentoId: string }>;
}) {
  const flags = await aprendizajeFlags();
  if (!flags.canView) redirect("/");

  const { cursoId, intentoId } = await params;
  const [curso, intento] = await Promise.all([getCurso(cursoId), getIntento(intentoId)]);
  // getIntento only resolves the caller's own attempts.
  if (!curso || !intento || intento.cursoId !== cursoId) notFound();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link
          href={`/aprendizaje/${cursoId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver al curso
        </Link>
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-[#04B1AF] uppercase">Evaluación</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{curso.title}</h1>
          <p className="text-sm text-muted-foreground">
            Responde todas las preguntas. Nota mínima para aprobar: {curso.evaluacion.passingScore}%.
          </p>
        </div>
        <EvaluacionForm cursoId={cursoId} intento={intento} passingScore={curso.evaluacion.passingScore} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `bun x vitest run "src/app/(app)/aprendizaje/[cursoId]"`, `bun x tsc --noEmit -p .`, `bun x eslint "src/app/(app)/aprendizaje/[cursoId]"` — Expected: all pass.

```bash
git add "src/app/(app)/aprendizaje/[cursoId]/evaluacion"
git commit -m "feat(aprendizaje): take an evaluation attempt and see the result"
```

---

### Task 8: Manager question form

**Files:**
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.tsx`
- Test: `src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const savePregunta = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ savePregunta: (...args: unknown[]) => savePregunta(...args) }));

const { PreguntaForm } = await import("./PreguntaForm");

describe("PreguntaForm", () => {
  beforeEach(() => savePregunta.mockReset().mockResolvedValue({}));

  it("creates a single-choice question", async () => {
    const onDone = vi.fn();
    render(<PreguntaForm cursoId="c1" onDone={onDone} />);

    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "¿Capital de RD?" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 1"), { target: { value: "Santiago" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 2"), { target: { value: "Santo Domingo" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar opción/ }));
    fireEvent.change(screen.getByLabelText("Texto de la opción 3"), { target: { value: "La Vega" } });
    fireEvent.click(screen.getByLabelText("Marcar opción 2 como correcta"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    await waitFor(() =>
      expect(savePregunta).toHaveBeenCalledWith("c1", {
        id: undefined,
        text: "¿Capital de RD?",
        type: "opcion_unica",
        options: [
          { text: "Santiago", isCorrect: false },
          { text: "Santo Domingo", isCorrect: true },
          { text: "La Vega", isCorrect: false },
        ],
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("validates before saving", () => {
    render(<PreguntaForm cursoId="c1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "¿?" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 1"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Texto de la opción 2"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    expect(screen.getByText("Marca exactamente una opción correcta.")).toBeTruthy();
    expect(savePregunta).not.toHaveBeenCalled();
  });

  it("creates a true/false question", async () => {
    render(<PreguntaForm cursoId="c1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "El sol es una estrella" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "verdadero_falso" } });
    fireEvent.click(screen.getByLabelText("Marcar opción 1 como correcta"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    await waitFor(() =>
      expect(savePregunta).toHaveBeenCalledWith("c1", {
        id: undefined,
        text: "El sol es una estrella",
        type: "verdadero_falso",
        options: [
          { text: "Verdadero", isCorrect: true },
          { text: "Falso", isCorrect: false },
        ],
      }),
    );
  });

  it("edits an existing question keeping option ids", async () => {
    render(
      <PreguntaForm
        cursoId="c1"
        onDone={vi.fn()}
        initial={{
          id: "p1",
          text: "Vieja",
          type: "opcion_unica",
          active: true,
          options: [
            { id: "o1", text: "A", isCorrect: true },
            { id: "o2", text: "B", isCorrect: false },
          ],
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Pregunta"), { target: { value: "Nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pregunta" }));

    await waitFor(() =>
      expect(savePregunta).toHaveBeenCalledWith("c1", {
        id: "p1",
        text: "Nueva",
        type: "opcion_unica",
        options: [
          { id: "o1", text: "A", isCorrect: true },
          { id: "o2", text: "B", isCorrect: false },
        ],
      }),
    );
  });
});
```

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.test.tsx"` — Expected: FAIL.

- [ ] **Step 2: `PreguntaForm.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PREGUNTA_TYPE_LABELS,
  TRUE_FALSE_TEXTS,
  validatePregunta,
  type OpcionInput,
  type PreguntaGestion,
  type PreguntaType,
} from "@/lib/aprendizaje/evaluacion";
import { FIELD_CLASS_NAME } from "@/lib/aprendizaje/types";
import { savePregunta } from "../actions";

const MAX_OPTIONS = 6;

const blankOptions = (): OpcionInput[] => [
  { text: "", isCorrect: false },
  { text: "", isCorrect: false },
];
const trueFalseOptions = (): OpcionInput[] => TRUE_FALSE_TEXTS.map((text) => ({ text, isCorrect: false }));

export function PreguntaForm({
  cursoId,
  initial,
  onDone,
}: {
  cursoId: string;
  initial?: PreguntaGestion;
  onDone: () => void;
}) {
  const router = useRouter();
  const formId = initial?.id ?? "nueva";
  const [text, setText] = useState(initial?.text ?? "");
  const [type, setType] = useState<PreguntaType>(initial?.type ?? "opcion_unica");
  const [options, setOptions] = useState<OpcionInput[]>(
    initial ? initial.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })) : blankOptions(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeType(next: PreguntaType) {
    setType(next);
    setOptions(next === "verdadero_falso" ? trueFalseOptions() : blankOptions());
  }

  function markCorrect(index: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === index })));
  }

  function updateText(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, text: value } : o)));
  }

  function save() {
    const input = { id: initial?.id, text, type, options };
    const invalid = validatePregunta(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await savePregunta(cursoId, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-1.5">
        <Label htmlFor={`pregunta-text-${formId}`}>Pregunta</Label>
        <textarea
          id={`pregunta-text-${formId}`}
          rows={2}
          className={FIELD_CLASS_NAME}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pregunta-type-${formId}`}>Tipo</Label>
        <select
          id={`pregunta-type-${formId}`}
          className={FIELD_CLASS_NAME}
          value={type}
          onChange={(e) => changeType(e.target.value as PreguntaType)}
        >
          {(Object.keys(PREGUNTA_TYPE_LABELS) as PreguntaType[]).map((t) => (
            <option key={t} value={t}>
              {PREGUNTA_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {type === "verdadero_falso" ? "Respuesta correcta" : "Opciones (marca la correcta)"}
        </legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correcta-${formId}`}
              checked={o.isCorrect}
              onChange={() => markCorrect(i)}
              aria-label={`Marcar opción ${i + 1} como correcta`}
              className="accent-[#04B1AF]"
            />
            {type === "verdadero_falso" ? (
              <span className="text-sm">{o.text}</span>
            ) : (
              <>
                <Input
                  value={o.text}
                  onChange={(e) => updateText(i, e.target.value)}
                  placeholder={`Opción ${i + 1}`}
                  aria-label={`Texto de la opción ${i + 1}`}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={options.length <= 2}
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Quitar opción ${i + 1}`}
                >
                  <X />
                </Button>
              </>
            )}
          </div>
        ))}
        {type === "opcion_unica" && options.length < MAX_OPTIONS && (
          <Button size="sm" variant="ghost" onClick={() => setOptions((prev) => [...prev, { text: "", isCorrect: false }])}>
            <Plus data-icon="inline-start" />
            Agregar opción
          </Button>
        )}
      </fieldset>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={isPending}>
          Guardar pregunta
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.test.tsx"` — Expected: 4 passed.

```bash
git add "src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.tsx" "src/app/(app)/aprendizaje/gestion/[cursoId]/PreguntaForm.test.tsx"
git commit -m "feat(aprendizaje): question form (single choice and true/false)"
```

---

### Task 9: Manager evaluation section

**Files:**
- Create: `src/app/(app)/aprendizaje/gestion/[cursoId]/EvaluacionEditor.tsx`
- Test: `src/app/(app)/aprendizaje/gestion/[cursoId]/EvaluacionEditor.test.tsx`
- Modify: `src/app/(app)/aprendizaje/gestion/[cursoId]/CursoEditor.tsx`, `page.tsx`, `CursoEditor.test.tsx`

- [ ] **Step 1: Failing test `EvaluacionEditor.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreguntaGestion } from "@/lib/aprendizaje/evaluacion";

const actions = {
  updateEvalSettings: vi.fn(),
  setPreguntaActiva: vi.fn(),
  deletePregunta: vi.fn(),
  savePregunta: vi.fn(),
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => actions);

const { EvaluacionEditor } = await import("./EvaluacionEditor");

const PREGUNTAS: PreguntaGestion[] = [
  {
    id: "p1",
    text: "¿Capital de RD?",
    type: "opcion_unica",
    active: true,
    options: [
      { id: "o1", text: "Santo Domingo", isCorrect: true },
      { id: "o2", text: "Santiago", isCorrect: false },
    ],
  },
  {
    id: "p2",
    text: "Pregunta vieja",
    type: "verdadero_falso",
    active: false,
    options: [
      { id: "o3", text: "Verdadero", isCorrect: false },
      { id: "o4", text: "Falso", isCorrect: true },
    ],
  },
];

const NO_EVAL = { questionsPerAttempt: null, passingScore: 70, maxAttempts: null };

describe("EvaluacionEditor", () => {
  beforeEach(() => Object.values(actions).forEach((fn) => fn.mockReset().mockResolvedValue({})));

  it("enables the evaluation with unlimited attempts", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={NO_EVAL} preguntas={PREGUNTAS} />);

    fireEvent.click(screen.getByLabelText("Este curso tiene evaluación"));
    fireEvent.change(screen.getByLabelText("Preguntas por persona"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Nota mínima (%)"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() =>
      expect(actions.updateEvalSettings).toHaveBeenCalledWith("c1", {
        questionsPerAttempt: 1,
        passingScore: 80,
        maxAttempts: null,
      }),
    );
  });

  it("disables the evaluation", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={{ questionsPerAttempt: 5, passingScore: 70, maxAttempts: 3 }} preguntas={PREGUNTAS} />);

    fireEvent.click(screen.getByLabelText("Este curso tiene evaluación"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() =>
      expect(actions.updateEvalSettings).toHaveBeenCalledWith("c1", {
        questionsPerAttempt: null,
        passingScore: 70,
        maxAttempts: 3,
      }),
    );
  });

  it("warns when the bank has fewer active questions than each person gets", () => {
    render(<EvaluacionEditor cursoId="c1" settings={{ questionsPerAttempt: 5, passingScore: 70, maxAttempts: null }} preguntas={PREGUNTAS} />);
    expect(screen.getByText(/a cada persona le tocarán solo 1/)).toBeTruthy();
  });

  it("lists the bank with the correct answers and toggles a question", async () => {
    render(<EvaluacionEditor cursoId="c1" settings={NO_EVAL} preguntas={PREGUNTAS} />);

    expect(screen.getByText("Banco de preguntas (1 activas de 2)")).toBeTruthy();
    expect(screen.getByText("Inactiva")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Desactivar" })[0]);

    await waitFor(() => expect(actions.setPreguntaActiva).toHaveBeenCalledWith("p1", "c1", false));
  });

  it("opens the form to add a question", () => {
    render(<EvaluacionEditor cursoId="c1" settings={NO_EVAL} preguntas={[]} />);
    expect(screen.getByText("Todavía no hay preguntas.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Agregar pregunta/ }));
    expect(screen.getByRole("button", { name: "Guardar pregunta" })).toBeTruthy();
  });
});
```

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion/[cursoId]/EvaluacionEditor.test.tsx"` — Expected: FAIL.

- [ ] **Step 2: `EvaluacionEditor.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PREGUNTA_TYPE_LABELS, validateEvalSettings, type PreguntaGestion } from "@/lib/aprendizaje/evaluacion";
import type { EvalSettings } from "@/lib/aprendizaje/types";
import { deletePregunta, setPreguntaActiva, updateEvalSettings } from "../actions";
import { PreguntaForm } from "./PreguntaForm";

const NEW_QUESTION = "nueva";

export function EvaluacionEditor({
  cursoId,
  settings,
  preguntas,
}: {
  cursoId: string;
  settings: EvalSettings;
  preguntas: PreguntaGestion[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.questionsPerAttempt !== null);
  const [perAttempt, setPerAttempt] = useState(String(settings.questionsPerAttempt ?? 10));
  const [passing, setPassing] = useState(String(settings.passingScore));
  const [maxAttempts, setMaxAttempts] = useState(settings.maxAttempts === null ? "" : String(settings.maxAttempts));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCount = preguntas.filter((p) => p.active).length;

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

  function saveSettings() {
    const next: EvalSettings = {
      questionsPerAttempt: enabled ? Number(perAttempt) : null,
      passingScore: Number(passing),
      maxAttempts: maxAttempts.trim() ? Number(maxAttempts) : null,
    };
    const invalid = validateEvalSettings(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    run(() => updateEvalSettings(cursoId, next), () => setNotice("Configuración guardada."));
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Evaluación</h2>
        <p className="text-sm text-muted-foreground">
          A cada persona le tocan preguntas al azar del banco, en distinto orden y con las opciones mezcladas. El curso
          se completa al aprobarla.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-[#04B1AF]"
        />
        Este curso tiene evaluación
      </label>

      {enabled && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="eval-per-attempt">Preguntas por persona</Label>
            <Input id="eval-per-attempt" type="number" min={1} value={perAttempt} onChange={(e) => setPerAttempt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval-passing">Nota mínima (%)</Label>
            <Input id="eval-passing" type="number" min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eval-max-attempts">Intentos permitidos</Label>
            <Input
              id="eval-max-attempts"
              type="number"
              min={1}
              placeholder="Ilimitados"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
            />
          </div>
        </div>
      )}
      {enabled && Number(perAttempt) > activeCount && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          El banco tiene {activeCount} {activeCount === 1 ? "pregunta activa" : "preguntas activas"}: a cada persona le
          tocarán {activeCount === 0 ? "ninguna" : `solo ${activeCount}`} hasta que agregues más.
        </p>
      )}
      <Button onClick={saveSettings} disabled={isPending}>
        Guardar configuración
      </Button>

      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">
            Banco de preguntas ({activeCount} activas de {preguntas.length})
          </h3>
          {editingId !== NEW_QUESTION && (
            <Button size="sm" variant="outline" onClick={() => setEditingId(NEW_QUESTION)}>
              <Plus data-icon="inline-start" />
              Agregar pregunta
            </Button>
          )}
        </div>
        {editingId === NEW_QUESTION && <PreguntaForm cursoId={cursoId} onDone={() => setEditingId(null)} />}
        {preguntas.length === 0 && editingId !== NEW_QUESTION && (
          <p className="text-sm text-muted-foreground">Todavía no hay preguntas.</p>
        )}
        <ol className="space-y-2">
          {preguntas.map((p, i) => (
            <li key={p.id}>
              {editingId === p.id ? (
                <PreguntaForm cursoId={cursoId} initial={p} onDone={() => setEditingId(null)} />
              ) : (
                <div className={`space-y-2 rounded-lg border p-3 ${p.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium">
                      {i + 1}. {p.text}
                    </p>
                    <Badge variant="outline">{PREGUNTA_TYPE_LABELS[p.type]}</Badge>
                    {!p.active && <Badge variant="secondary">Inactiva</Badge>}
                  </div>
                  <ul className="space-y-0.5 pl-4 text-sm">
                    {p.options.map((o) => (
                      <li
                        key={o.id}
                        className={`flex items-center gap-1.5 ${
                          o.isCorrect ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                        }`}
                      >
                        {o.isCorrect ? <CheckCircle2 className="size-3.5" /> : <span className="inline-block size-3.5" />}
                        {o.text}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setEditingId(p.id)}>
                      <Pencil data-icon="inline-start" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => setPreguntaActiva(p.id, cursoId, !p.active))}
                    >
                      {p.active ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm("¿Eliminar esta pregunta del banco?")) run(() => deletePregunta(p.id, cursoId));
                      }}
                    >
                      <Trash2 data-icon="inline-start" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the editor**
  - `CursoEditor.tsx`: add imports `import type { PreguntaGestion } from "@/lib/aprendizaje/evaluacion";` and `import { EvaluacionEditor } from "./EvaluacionEditor";`; change the signature to `export function CursoEditor({ curso, preguntas = [] }: { curso: CursoDetail; preguntas?: PreguntaGestion[] }) {`; after the closing `</section>` of the "Lecciones" section add:

```tsx
      <EvaluacionEditor cursoId={curso.id} settings={curso.evaluacion} preguntas={preguntas} />
```

  - `gestion/[cursoId]/page.tsx`: import `listPreguntas` from `../actions`; replace `const curso = await getCursoGestion(cursoId);` with `const [curso, preguntas] = await Promise.all([getCursoGestion(cursoId), listPreguntas(cursoId)]);`; render `<CursoEditor key={curso.id} curso={curso} preguntas={preguntas} />`.
  - `CursoEditor.test.tsx`: add `updateEvalSettings: vi.fn(), savePregunta: vi.fn(), setPreguntaActiva: vi.fn(), deletePregunta: vi.fn(),` to the `actions` object.

- [ ] **Step 4: Verify and commit**

Run: `bun x vitest run "src/app/(app)/aprendizaje/gestion"`, `bun x tsc --noEmit -p .`, `bun x eslint "src/app/(app)/aprendizaje"` — Expected: all pass.

```bash
git add "src/app/(app)/aprendizaje/gestion/[cursoId]"
git commit -m "feat(aprendizaje): evaluation settings and question bank in the course editor"
```

---

### Task 10: Integration tests

**Files:**
- Create: `src/test/integration/aprendizajeEvaluaciones.test.ts`

Requires Task 1's migration applied to the database `.env.local` points to.

- [ ] **Step 1: Write the tests**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("aprendizaje evaluations", () => {
  let manager: TestUser;
  let learner: TestUser;
  const cursoIds: string[] = [];

  beforeAll(async () => {
    manager = await createTestUser("Super Admin");
    learner = await createTestUser("Viewer");
  }, 60_000);

  afterAll(async () => {
    const admin = createAdminClient();
    if (cursoIds.length > 0) await admin.from("aprendizaje_cursos").delete().in("id", cursoIds);
    for (const user of [manager, learner]) {
      if (user) await deleteTestUser(user.id);
    }
  }, 60_000);

  /** Published course with one lesson and `questionCount` questions whose FIRST option is correct. */
  async function createCursoConEvaluacion(opts: { questionCount: number; perAttempt: number; maxAttempts?: number }) {
    const db = manager.client;
    const { data: curso, error } = await db
      .from("aprendizaje_cursos")
      .insert({
        title: "Curso evaluado",
        category: "curso",
        created_by: manager.id,
        eval_questions_per_attempt: opts.perAttempt,
        eval_passing_score: 70,
        eval_max_attempts: opts.maxAttempts ?? null,
      })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoIds.push(curso.id);

    const { data: leccion, error: leccionError } = await db
      .from("aprendizaje_lecciones")
      .insert({ curso_id: curso.id, position: 0, title: "Única" })
      .select("id")
      .single();
    if (leccionError || !leccion) throw new Error(`insert leccion: ${leccionError?.message}`);

    const correctByPregunta = new Map<string, string>();
    for (let i = 0; i < opts.questionCount; i++) {
      const { data: pregunta, error: pError } = await db
        .from("aprendizaje_preguntas")
        .insert({ curso_id: curso.id, text: `Pregunta ${i + 1}`, type: "opcion_unica", position: i })
        .select("id")
        .single();
      if (pError || !pregunta) throw new Error(`insert pregunta: ${pError?.message}`);
      const { data: opciones, error: oError } = await db
        .from("aprendizaje_opciones")
        .insert([
          { pregunta_id: pregunta.id, text: "Correcta", is_correct: true, position: 0 },
          { pregunta_id: pregunta.id, text: "Incorrecta", is_correct: false, position: 1 },
        ])
        .select("id, is_correct");
      if (oError) throw new Error(`insert opciones: ${oError.message}`);
      correctByPregunta.set(pregunta.id, (opciones ?? []).find((o) => o.is_correct)!.id);
    }

    const { error: publishError } = await db.from("aprendizaje_cursos").update({ status: "publicado" }).eq("id", curso.id);
    if (publishError) throw new Error(`publish: ${publishError.message}`);
    return { cursoId: curso.id as string, leccionId: leccion.id as string, correctByPregunta };
  }

  it("never lets a learner read the question bank", async () => {
    const { cursoId } = await createCursoConEvaluacion({ questionCount: 2, perAttempt: 2 });
    const { data: preguntas } = await learner.client.from("aprendizaje_preguntas").select("id").eq("curso_id", cursoId);
    expect(preguntas).toEqual([]);
    const { data: opciones } = await learner.client.from("aprendizaje_opciones").select("id, is_correct").limit(1);
    expect(opciones).toEqual([]);
  });

  it("requires all lessons before starting", async () => {
    const { cursoId } = await createCursoConEvaluacion({ questionCount: 2, perAttempt: 2 });
    const { error } = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(error?.message).toContain("Primero completa todas las lecciones");
  });

  it("draws N questions without answers, grades them and completes the course", async () => {
    const { cursoId, leccionId, correctByPregunta } = await createCursoConEvaluacion({ questionCount: 3, perAttempt: 2 });
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionId });

    // Lessons done but evaluation not passed yet: not completed.
    let { data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single();
    expect(inscripcion?.completed_at).toBeNull();

    const { data: intentoId, error: startError } = await learner.client.rpc("aprendizaje_iniciar_intento", {
      p_curso_id: cursoId,
    });
    expect(startError).toBeNull();

    const again = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(again.data).toBe(intentoId);

    const { data: preguntas } = await learner.client.rpc("aprendizaje_preguntas_intento", { p_intento_id: intentoId });
    expect(preguntas).toHaveLength(2);
    for (const p of preguntas as { id: string; options: Record<string, unknown>[] }[]) {
      expect(p.options).toHaveLength(2);
      for (const o of p.options) expect(o).not.toHaveProperty("is_correct");
    }

    const answers = Object.fromEntries(
      (preguntas as { id: string }[]).map((p) => [p.id, correctByPregunta.get(p.id)!]),
    );
    const { data: resultado, error: submitError } = await learner.client.rpc("aprendizaje_enviar_intento", {
      p_intento_id: intentoId,
      p_answers: answers,
    });
    expect(submitError).toBeNull();
    expect(resultado).toEqual({ score: 100, passed: true, correct: 2, total: 2 });

    ({ data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single());
    expect(inscripcion?.completed_at).not.toBeNull();

    const afterPass = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(afterPass.error?.message).toContain("Ya aprobaste esta evaluación");

    const resubmit = await learner.client.rpc("aprendizaje_enviar_intento", { p_intento_id: intentoId, p_answers: answers });
    expect(resubmit.error?.message).toContain("Este intento ya fue enviado");
  });

  it("fails below the passing score and enforces the attempt limit", async () => {
    const { cursoId, leccionId } = await createCursoConEvaluacion({ questionCount: 2, perAttempt: 2, maxAttempts: 1 });
    await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionId });

    const { data: intentoId } = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    const { data: resultado } = await learner.client.rpc("aprendizaje_enviar_intento", {
      p_intento_id: intentoId,
      p_answers: {},
    });
    expect(resultado).toEqual({ score: 0, passed: false, correct: 0, total: 2 });

    const { data: inscripcion } = await learner.client
      .from("aprendizaje_inscripciones")
      .select("completed_at")
      .eq("curso_id", cursoId)
      .single();
    expect(inscripcion?.completed_at).toBeNull();

    const { error } = await learner.client.rpc("aprendizaje_iniciar_intento", { p_curso_id: cursoId });
    expect(error?.message).toContain("Ya usaste todos tus intentos");
  });

  it("keeps attempts write-protected and private", async () => {
    const { cursoId } = await createCursoConEvaluacion({ questionCount: 1, perAttempt: 1 });
    const { error } = await learner.client
      .from("aprendizaje_intentos")
      .insert({ curso_id: cursoId, app_user_id: learner.id, questions: [], score: 100, passed: true });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run** (after the user applies the migration)

Run: `bun x vitest run src/test/integration/aprendizajeEvaluaciones.test.ts` — Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/aprendizajeEvaluaciones.test.ts
git commit -m "test(aprendizaje): evaluation RLS and grading integration tests"
```

---

### Task 11: Full verification

- [ ] `bun x vitest run src/lib/aprendizaje "src/app/(app)/aprendizaje"` — all pass.
- [ ] `bun x tsc --noEmit -p .` and `bun x eslint src/lib/aprendizaje "src/app/(app)/aprendizaje"` — clean.
- [ ] `bun --bun next build` — compiles, lists `/aprendizaje/[cursoId]/evaluacion/[intentoId]`.
- [ ] After the migration is applied: integration tests (Task 10) and `src/test/integration/aprendizajeRls.test.ts` pass.
