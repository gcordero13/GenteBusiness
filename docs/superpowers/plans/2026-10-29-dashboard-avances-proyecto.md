# Dashboard de Avances (por proyecto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th read-only view — "Dashboard" — to the Proyectos view switcher (alongside Lista/Tablero/Calendario/Jerarquía), showing 4 widgets (avance general, desglose por estado, carga por responsable, vencidas/por vencer) derived entirely client-side from the `tasks` the project page already loads.

**Architecture:** A new presentational component `DashboardView.tsx` (same pattern as `CalendarioView.tsx`/`JerarquiaView.tsx`: takes `tasks`/`onSelect` props, no mutations of its own) hosts a reusable `Donut` SVG component and 4 widget sub-components, each a pure function of the `tasks` array. Wired into `ProyectosWorkspace.tsx`'s existing view-switcher exactly like the other 4 views.

**Tech Stack:** No new dependency — donut charts are hand-rolled SVG (`stroke-dasharray`/`stroke-dashoffset`), consistent with this codebase having no charting library anywhere else. Next.js 16 App Router, Bun.

---

## Task 1: Create `DashboardView.tsx` with the `Donut` component and the "Avance general" widget

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/DashboardView.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import type { TareaListRow } from "./actions";

// Reusable donut: one <circle> per segment, each offset by the cumulative
// length of every prior segment so they tile around the ring without
// gaps or overlap. `-rotate-90` on the <svg> starts the first segment at
// 12 o'clock instead of SVG's default 3 o'clock start point.
function Donut({
  segments,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  centerLabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const size = 120;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetSoFar = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {total === 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted"
            strokeWidth={strokeWidth}
          />
        ) : (
          segments.map((s, i) => {
            const length = (s.value / total) * circumference;
            const dashoffset = -offsetSoFar;
            offsetSoFar += length;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashoffset}
              />
            );
          })
        )}
      </svg>
      {centerLabel && (
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-foreground">
          {centerLabel}
        </div>
      )}
    </div>
  );
}

// Same calculation as proyectoPercent in [id]/page.tsx (average of root
// tasks' percentComplete), computed here from whatever `tasks` this widget
// was given (which may be date-filtered) instead of needing a prop passed
// down from the page for a number it can derive itself.
function AvanceGeneralWidget({ tasks }: { tasks: TareaListRow[] }) {
  const rootTasks = tasks.filter((t) => !t.parentTaskId);
  const percent =
    rootTasks.length > 0
      ? Math.round(rootTasks.reduce((sum, t) => sum + t.percentComplete, 0) / rootTasks.length)
      : 0;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Avance general</p>
      {rootTasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas todavía.</p>
      ) : (
        <div className="flex justify-center">
          <Donut
            segments={[
              { value: percent, color: "#04B1AF" },
              { value: 100 - percent, color: "#e5e7eb" },
            ]}
            centerLabel={`${percent}%`}
          />
        </div>
      )}
    </div>
  );
}

export function DashboardView({ tasks }: { tasks: TareaListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/DashboardView.tsx"`
Expected: sin errores. Nada importa este archivo todavía, así que no hay forma de verlo renderizado en este paso.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/DashboardView.tsx"
git commit -F - <<'EOF'
feat(planificacion): add DashboardView with Donut and avance general widget

First slice of the project progress dashboard (see
docs/superpowers/specs/2026-10-29-dashboard-avances-proyecto-design.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: Wire the Dashboard tab into `ProyectosWorkspace.tsx`

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`

- [ ] **Step 1: Add the icon import and the `DashboardView` import**

Replace the lucide-react import (line 5):

```ts
import { Calendar, Download, LayoutGrid, List, Network } from "lucide-react";
```

with:

```ts
import { Calendar, Download, LayoutDashboard, LayoutGrid, List, Network } from "lucide-react";
```

Add a new import for `DashboardView`, right after the `JerarquiaView` import (line 10):

```ts
import { JerarquiaView } from "./JerarquiaView";
import { DashboardView } from "./DashboardView";
```

- [ ] **Step 2: Extend `ViewMode` and `VIEW_OPTIONS`**

Replace (lines 15-22):

```ts
type ViewMode = "lista" | "tablero" | "calendario" | "jerarquia";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "tablero", label: "Tablero", icon: LayoutGrid },
  { key: "calendario", label: "Calendario", icon: Calendar },
  { key: "jerarquia", label: "Jerarquía", icon: Network },
];
```

with:

```ts
type ViewMode = "lista" | "tablero" | "calendario" | "jerarquia" | "dashboard";

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "tablero", label: "Tablero", icon: LayoutGrid },
  { key: "calendario", label: "Calendario", icon: Calendar },
  { key: "jerarquia", label: "Jerarquía", icon: Network },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
];
```

- [ ] **Step 3: Render `DashboardView` for the new tab**

Replace the Jerarquía render line (currently line 265):

```tsx
      {view === "jerarquia" && <JerarquiaView tasks={filteredTasks} onSelect={setSelected} />}
```

with:

```tsx
      {view === "jerarquia" && <JerarquiaView tasks={filteredTasks} onSelect={setSelected} />}
      {view === "dashboard" && <DashboardView tasks={filteredTasks} />}
```

`filteredTasks` (not `rootFilteredTasks`) so the Dashboard respects the existing Desde/Hasta date filter the same way Jerarquía already does, and includes sub-tasks for the estado/workload widgets added in later tasks.

- [ ] **Step 4: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"`
Expected: sin errores.

- [ ] **Step 5: Probar manualmente en dev**

Run: `bun run dev`
Abrir un proyecto con tareas, hacer clic en el nuevo tab "Dashboard". Expected: se ve la tarjeta "Avance general" con la dona mostrando el % correcto (comparar contra el % que ya se ve en el encabezado de la página del proyecto).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"
git commit -F - <<'EOF'
feat(planificacion): add Dashboard tab to the Proyectos view switcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: Add the "Desglose por estado" widget

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/DashboardView.tsx`

- [ ] **Step 1: Add the widget function**

Add this function right after `AvanceGeneralWidget` (before `export function DashboardView`):

```tsx
// Counts EVERY task (roots and sub-tasks alike - each has its own
// estado_id independent of percentComplete being a rollup for parents),
// grouped by estado. Tasks with no estado_id fall into a "Sin estado"
// bucket instead of being silently dropped.
function DesgloseEstadoWidget({ tasks }: { tasks: TareaListRow[] }) {
  const groups = new Map<string, { name: string; color: string; count: number }>();
  for (const t of tasks) {
    const key = t.estadoId ?? "sin-estado";
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { name: t.estadoName ?? "Sin estado", color: t.estadoColor ?? "#94a3b8", count: 1 });
    }
  }
  const entries = [...groups.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Desglose por estado</p>
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas todavía.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <Donut segments={entries.map((e) => ({ value: e.count, color: e.color }))} centerLabel={String(tasks.length)} />
          <div className="min-w-0 flex-1 space-y-1">
            {entries.map((e) => (
              <div key={e.name} className="flex items-center gap-1.5 text-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                <span className="min-w-0 flex-1 truncate text-foreground">{e.name}</span>
                <span className="shrink-0 font-semibold text-muted-foreground">{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in `DashboardView`**

Replace:

```tsx
export function DashboardView({ tasks }: { tasks: TareaListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
    </div>
  );
}
```

with:

```tsx
export function DashboardView({ tasks }: { tasks: TareaListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/DashboardView.tsx"`
Expected: sin errores.

- [ ] **Step 4: Probar manualmente en dev**

En el tab Dashboard de un proyecto con tareas en distintos estados (y alguna sin estado si es posible), confirmar que la dona y la lista de conteos coinciden con lo que se ve en Lista/Tablero.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/DashboardView.tsx"
git commit -F - <<'EOF'
feat(planificacion): add desglose-por-estado widget to Dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: Add the "Carga por responsable" widget

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/DashboardView.tsx`

- [ ] **Step 1: Add the widget function**

Add this function right after `DesgloseEstadoWidget`:

```tsx
// Leaf tasks only (!hasChildren) - a task with sub-tasks isn't anyone's
// direct workload, the same distinction Lista's inline checkbox already
// uses for "is this task's percent directly settable".
function CargaResponsableWidget({ tasks }: { tasks: TareaListRow[] }) {
  const leafTasks = tasks.filter((t) => !t.hasChildren);
  const counts = new Map<string, number>();
  for (const t of leafTasks) {
    const key = t.assigneeName ?? "Sin asignar";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? entries[0][1] : 0;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Carga por responsable</p>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas todavía.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([name, count]) => (
            <div key={name} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-foreground">{name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[#04B1AF]" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
              </div>
              <span className="w-5 shrink-0 text-right font-semibold text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it in `DashboardView`**

Replace:

```tsx
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
    </div>
  );
}
```

with:

```tsx
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
      <CargaResponsableWidget tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/DashboardView.tsx"`
Expected: sin errores.

- [ ] **Step 4: Probar manualmente en dev**

En un proyecto con varias tareas hoja asignadas a distintas personas (y alguna sin asignar), confirmar que las barras y los números coinciden con un conteo manual. Confirmar que una tarea con subtareas NO cuenta en ninguna barra.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/DashboardView.tsx"
git commit -F - <<'EOF'
feat(planificacion): add carga-por-responsable widget to Dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: Add the "Vencidas / por vencer" widget and wire `onSelect`

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/DashboardView.tsx`
- Modify: `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`

- [ ] **Step 1: Add the widget function**

Add this function right after `CargaResponsableWidget`:

```tsx
// Excludes already-completed tasks (percentComplete === 100) even if their
// dueDate is in the past - a finished task isn't "overdue" in any
// actionable sense. dueDate is a plain "YYYY-MM-DD" string, compared
// lexicographically - the same pattern ProyectosWorkspace's own
// fromDate/toDate filter already relies on.
function VencidasWidget({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const in7DaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const pending = tasks.filter((t) => t.dueDate && t.percentComplete !== 100);
  const vencidas = pending.filter((t) => t.dueDate! < todayIso);
  const porVencer = pending.filter((t) => t.dueDate! >= todayIso && t.dueDate! <= in7DaysIso);
  const urgentes = [...vencidas, ...porVencer]
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0))
    .slice(0, 5);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-foreground">Vencidas / por vencer</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{vencidas.length}</p>
          <p className="text-[11px] text-muted-foreground">Vencidas</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{porVencer.length}</p>
          <p className="text-[11px] text-muted-foreground">Por vencer (7 días)</p>
        </div>
      </div>
      {urgentes.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Sin tareas vencidas ni próximas a vencer.</p>
      ) : (
        <div className="space-y-1">
          {urgentes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-xs hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
              <span className={`shrink-0 font-semibold ${t.dueDate! < todayIso ? "text-red-600" : "text-amber-600"}`}>
                {t.dueDate}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Extend `DashboardView`'s props and render the new widget**

Replace:

```tsx
export function DashboardView({ tasks }: { tasks: TareaListRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
      <CargaResponsableWidget tasks={tasks} />
    </div>
  );
}
```

with:

```tsx
export function DashboardView({
  tasks,
  onSelect,
}: {
  tasks: TareaListRow[];
  onSelect: (t: TareaListRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AvanceGeneralWidget tasks={tasks} />
      <DesgloseEstadoWidget tasks={tasks} />
      <CargaResponsableWidget tasks={tasks} />
      <VencidasWidget tasks={tasks} onSelect={onSelect} />
    </div>
  );
}
```

- [ ] **Step 3: Pass `onSelect` from `ProyectosWorkspace`**

In `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`, replace:

```tsx
      {view === "dashboard" && <DashboardView tasks={filteredTasks} />}
```

with:

```tsx
      {view === "dashboard" && <DashboardView tasks={filteredTasks} onSelect={setSelected} />}
```

- [ ] **Step 4: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/DashboardView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"`
Expected: sin errores.

- [ ] **Step 5: Probar manualmente en dev**

Con una tarea cuya fecha límite ya pasó (y no esté al 100%) y otra dentro de los próximos 7 días, confirmar que aparecen en los contadores y en la lista correcta. Marcar una tarea vencida como completada (100%) y confirmar que desaparece de "Vencidas". Hacer clic en una fila de la lista → debe abrir el modal de esa tarea.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/DashboardView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"
git commit -F - <<'EOF'
feat(planificacion): add vencidas-por-vencer widget to Dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 6: Edge-case audit (empty project, zero-division)

**Files:** ninguno nuevo — solo auditoría y, si hace falta, ajustes puntuales en `src/app/(app)/planificacion/proyectos/DashboardView.tsx`.

- [ ] **Step 1: Releer los 4 widgets y confirmar cada guard ya presente**

Cada widget ya trae su guard desde que se escribió (no se agregan ahora por primera vez - esto es una auditoría, no una implementación nueva):

- `AvanceGeneralWidget`: `rootTasks.length > 0 ? ... : 0` evita `NaN` por 0/0, y el `rootTasks.length === 0` muestra el estado vacío en vez de una dona al 0%.
- `DesgloseEstadoWidget`: `tasks.length === 0` muestra el estado vacío antes de siquiera construir `entries`/llamar a `Donut`. `Donut` en sí también cubre `total === 0` con un anillo gris plano (defensa adicional si algún día se le pasan segmentos con valores en 0).
- `CargaResponsableWidget`: `entries.length === 0` muestra el estado vacío; `max > 0 ? ... : 0` evita división por cero en el ancho de la barra.
- `VencidasWidget`: no divide nada: `vencidas.length`/`porVencer.length` son conteos simples (0 es un valor válido, no un error), y `urgentes.length === 0` muestra su propio mensaje.

- [ ] **Step 2: Probar con un proyecto vacío**

Crear o usar un proyecto sin tareas, abrir el tab Dashboard. Expected: los 4 widgets muestran su texto de estado vacío ("Sin tareas todavía." / "Sin tareas vencidas ni próximas a vencer."), sin `NaN`, `Infinity`, ni donas/barras rotas en pantalla.

- [ ] **Step 3: Si algo falla, corregirlo aquí mismo**

Si el Step 2 revela un caso no cubierto, arreglarlo directamente en `DashboardView.tsx` y volver a correr `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/DashboardView.tsx"` antes de continuar.

- [ ] **Step 4: Commit (solo si el Step 3 cambió algo)**

```bash
git add "src/app/(app)/planificacion/proyectos/DashboardView.tsx"
git commit -F - <<'EOF'
fix(planificacion): handle an empty-project edge case in Dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

Si el Step 2 no encontró nada que corregir, no hay commit en esta tarea - seguir directo a la Tarea 7.

---

## Task 7: Verificación final y despliegue a preview

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Typecheck y lint de todos los archivos tocados**

```bash
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/DashboardView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"
```

Expected: sin errores en ningún comando.

- [ ] **Step 2: Lista de smoke-test manual completa** (del spec, sección 5)

- Abrir un proyecto con tareas en varios estados, con subtareas, con algunas vencidas → cada uno de los 4 widgets muestra números coherentes con lo que ya se ve en Lista/Tablero.
- Proyecto vacío (sin tareas) → cada widget muestra su estado vacío, sin errores ni `NaN`/`Infinity` en pantalla.
- Cambiar el filtro de fecha "Desde/Hasta" (ya compartido por las otras vistas) → los 4 widgets se recalculan con el subconjunto filtrado.
- Hacer clic en una tarea de la lista de "Vencidas/por vencer" → abre el modal de detalle de esa tarea.
- Redimensionar a celular → la grilla pasa a 1 columna, nada se corta ni desborda horizontalmente.

- [ ] **Step 3: Deploy a preview**

```bash
bunx vercel
```

Expected: build exitoso, URL de preview devuelta. Repetir la lista de smoke-test del Step 2 sobre esa URL.

- [ ] **Step 4: Confirmar con el usuario antes de producción**

No ejecutar `bunx vercel --prod` hasta que el usuario confirme explícitamente ("sí, despliega") después de probar el preview.

---

## Self-Review

**Cobertura del spec:** Sección 1 (dónde vive: nuevo archivo + wiring en `ProyectosWorkspace`) → Tasks 1-2. Sección 2.1 (avance general) → Task 1. Sección 2.2 (desglose por estado) → Task 3. Sección 2.3 (carga por responsable) → Task 4. Sección 2.4 (vencidas/por vencer) → Task 5. Sección 3 (componente `Donut` reutilizable, técnica stroke-dasharray/dashoffset, label centrado con `<div>` absoluto) → Task 1, reutilizado tal cual en Task 3. Sección 4 (manejo de errores: estados vacíos, guardas contra división por cero) → cada widget los trae desde que se escribe (Tasks 1/3/4/5), Task 6 audita que efectivamente estén y lo prueba con un proyecto vacío real. Sección 5 (testing) → Task 7, lista copiada verbatim. "Fuera de alcance" del spec (dashboard cruzando proyectos, librería de gráficos, widgets editables, exportar) → ningún task los agrega, correcto.

**Escaneo de placeholders:** ninguno — cada paso trae código completo y comandos exactos.

**Consistencia de tipos:** `DashboardView`'s props van de `{ tasks }` (Tasks 1-4) a `{ tasks, onSelect }` (Task 5) de forma explícita en ambos lados del cambio (el componente y su único call site en `ProyectosWorkspace.tsx`), sin dejar una versión desincronizada. Los 4 widgets comparten el mismo tipo `TareaListRow` ya existente en `actions.ts` sin inventar campos nuevos - `estadoId`/`estadoName`/`estadoColor`, `hasChildren`, `assigneeName`, `dueDate`, `percentComplete`, `parentTaskId` ya existen todos en esa interfaz tal como se confirmó leyendo el archivo real antes de escribir este plan. `Donut`'s `segments: { value: number; color: string }[]` se usa de forma idéntica en `AvanceGeneralWidget` (Task 1) y `DesgloseEstadoWidget` (Task 3).
