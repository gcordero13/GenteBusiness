# Celebración de Tareas Completadas (Confeti) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando una tarea de `Proyectos` transiciona de un porcentaje distinto de 100 a exactamente 100 (lo que ya dispara su paso automático al estado "Completado"), mostrar un burst de confeti localizado en el elemento que disparó el cambio, con un pulso CSS estático de respaldo cuando el usuario tiene activado "reducir movimiento".

**Architecture:** Un módulo plano (sin `"use client"`) `celebrate.ts` centraliza la decisión confeti-vs-pulso-estático y la llamada a `canvas-confetti`. Las vistas presentacionales (`TableroView`, `ListaView`) solo exponen el elemento DOM del disparo a través de sus callbacks ya existentes (`onDrop`, un nuevo `onToggleComplete`); la lógica de "¿esto fue una transición hacia 100%?" y la llamada a `celebrateCompletion` viven en los componentes que ya poseen las mutaciones del servidor: `ProyectosWorkspace.tsx` (Tablero y el nuevo checkbox de Lista) y `TareaDetailModal.tsx` (slider de % y checkbox de subtarea).

**Tech Stack:** `canvas-confetti` (nueva dependencia), `@types/canvas-confetti` (dev), `window.matchMedia` nativo. Next.js 16 App Router, Bun.

---

## Task 1: Agregar la dependencia `canvas-confetti`

**Files:**
- Modify: `package.json`, `bun.lock` (generados por el comando, no se editan a mano)

- [ ] **Step 1: Instalar el paquete y sus tipos**

```bash
bunx --version
bun add canvas-confetti
bun add -d @types/canvas-confetti
```

Expected: ambos comandos terminan sin error y `package.json` gana `canvas-confetti` en `dependencies` y `@types/canvas-confetti` en `devDependencies`.

- [ ] **Step 2: Verificar que el typecheck sigue limpio**

Run: `bunx tsc --noEmit`
Expected: sin errores (el paquete nuevo no se usa todavía, esto solo confirma que la instalación no rompió nada).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -F - <<'EOF'
chore(planificacion): add canvas-confetti dependency

First step of the task-completion celebration feature (see
docs/superpowers/specs/2026-10-28-tarea-completion-celebration-design.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: Crear el módulo `celebrate.ts`

**Files:**
- Create: `src/app/(app)/planificacion/proyectos/celebrate.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
import confetti from "canvas-confetti";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Resuelve el punto de origen del burst de confeti en coordenadas normalizadas
// (0-1) que espera canvas-confetti, a partir de la posición en pantalla del
// elemento que disparó la celebración (tarjeta, fila, control).
function originFromElement(el: Element | null): { x: number; y: number } {
  if (!el) return { x: 0.5, y: 0.5 };
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
  };
}

// Pulso CSS breve sobre el elemento (sin partículas) para cuando el usuario
// tiene activado "reducir movimiento" en su sistema operativo.
function staticPulse(el: Element | null): void {
  if (!el || !(el instanceof HTMLElement)) return;
  el.animate(
    [
      { boxShadow: "0 0 0 0 rgba(34,197,94,0.5)" },
      { boxShadow: "0 0 0 8px rgba(34,197,94,0)" },
    ],
    { duration: 500, easing: "ease-out" },
  );
}

// Llamar tras una actualización exitosa que haya llevado percentComplete de
// un valor distinto de 100 a exactamente 100. `anchorEl` es el elemento
// visual (tarjeta de Tablero, fila de Lista, control del modal) desde el que
// debe salir el confeti.
export function celebrateCompletion(anchorEl: Element | null): void {
  if (prefersReducedMotion()) {
    staticPulse(anchorEl);
    return;
  }
  const origin = originFromElement(anchorEl);
  confetti({
    particleCount: 60,
    spread: 55,
    startVelocity: 28,
    gravity: 1.1,
    scalar: 0.8,
    origin,
    colors: ["#04B1AF", "#22c55e", "#facc15", "#0b2447"],
  });
}
```

- [ ] **Step 2: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/celebrate.ts"`
Expected: sin errores. Nada llama a este módulo todavía, así que no hay comportamiento que probar manualmente en este paso.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/celebrate.ts"
git commit -F - <<'EOF'
feat(planificacion): add celebrateCompletion confetti helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: Disparar confeti al arrastrar una tarjeta a "Completado" en Tablero

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/TableroView.tsx`
- Modify: `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`

- [ ] **Step 1: Extender `TableroView` para capturar y propagar el elemento arrastrado**

En `src/app/(app)/planificacion/proyectos/TableroView.tsx`, cambiar la firma del prop `onDrop` (línea 26):

```ts
  onDrop?: (taskId: string, columnKey: string) => void;
```

por:

```ts
  onDrop?: (taskId: string, columnKey: string, cardEl: HTMLElement | null) => void;
```

Agregar un segundo estado junto a `draggingId` (línea 28):

```ts
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingEl, setDraggingEl] = useState<HTMLElement | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
```

Actualizar el handler de `onDrop` del contenedor de columna (líneas 53-60) para leer y limpiar también `draggingEl`:

```ts
            onDrop={(e) => {
              if (!onDrop) return;
              e.preventDefault();
              setDragOverKey(null);
              const id = draggingId;
              const el = draggingEl;
              setDraggingId(null);
              setDraggingEl(null);
              if (id) onDrop(id, col.key, el);
            }}
```

Actualizar `onDragStart`/`onDragEnd` de la tarjeta (líneas 78-79) para fijar/limpiar `draggingEl`:

```ts
                  onDragStart={(e) => {
                    setDraggingId(t.id);
                    setDraggingEl(e.currentTarget);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDraggingEl(null);
                  }}
```

- [ ] **Step 2: Disparar la celebración desde `ProyectosWorkspace.dropEstado`**

En `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`, agregar el import (línea 6, junto a los demás de `./actions`):

```ts
import { updateTareaFecha, updateTareaPercent, type EstadoOption, type PlanificacionRow, type TareaListRow } from "./actions";
```

y un nuevo import para `celebrateCompletion`:

```ts
import { celebrateCompletion } from "./celebrate";
```

Reemplazar la función `dropEstado` (líneas 131-137):

```ts
  function dropEstado(taskId: string, columnKey: string) {
    if (!onDropEstado) return;
    startTransition(async () => {
      await onDropEstado(taskId, columnKey);
      router.refresh();
    });
  }
```

por:

```ts
  function dropEstado(taskId: string, columnKey: string, cardEl: HTMLElement | null) {
    if (!onDropEstado) return;
    const task = tasks.find((t) => t.id === taskId);
    const wasComplete = task?.percentComplete === 100;
    const targetEstado = estados.find((e) => e.id === columnKey);
    startTransition(async () => {
      const result = await onDropEstado(taskId, columnKey);
      if (!result.error && !wasComplete && targetEstado?.kind === "completado") {
        celebrateCompletion(cardEl);
      }
      router.refresh();
    });
  }
```

`updateTareaPercent` todavía no se usa en este archivo en este Task — el import se agrega aquí porque el Task 6 lo necesita en el mismo archivo y así se evita un segundo diff de import; si el linter de no-unused-vars se queja en este punto (no debería, TypeScript no falla por imports sin usar pero ESLint sí puede), mover ese import al Task 6 en su lugar.

- [ ] **Step 3: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/TableroView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"`
Expected: sin errores. Si ESLint marca `updateTareaPercent` como importado sin usar, quitar ese import de este Task (se agregará en el Task 6).

- [ ] **Step 4: Probar manualmente en dev**

Run: `bun run dev`
Ir a un proyecto, abrir la vista Tablero, arrastrar una tarjeta que no esté al 100% hacia la columna "Completado". Expected: confeti sale desde la posición de la tarjeta soltada (o, con "reducir movimiento" activado en Windows, un pulso verde breve). Arrastrar una tarjeta que YA está en una columna "Completado" hacia otra columna "Completado" (si el catálogo tuviera más de una, cosa que no debería pasar con los estados por defecto) no debe celebrar de nuevo.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/TableroView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"
git commit -F - <<'EOF'
feat(planificacion): celebrate completing a task via Tablero drag-drop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: Disparar confeti desde el slider de porcentaje del modal

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx`

- [ ] **Step 1: Importar `celebrateCompletion`**

Agregar junto a los demás imports locales (línea 51, junto a `progressOpacity`):

```ts
import { progressOpacity } from "./progress";
import { celebrateCompletion } from "./celebrate";
```

- [ ] **Step 2: Extender `commitPercent` para recibir el elemento ancla y celebrar**

Reemplazar la función `commitPercent` (líneas 220-232):

```ts
  function commitPercent(value: number) {
    if (!tarea) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTareaPercent(tarea.id, value, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        setPercentDraft(tarea.percentComplete);
        return;
      }
      router.refresh();
    });
  }
```

por:

```ts
  function commitPercent(value: number, anchorEl: HTMLElement | null) {
    if (!tarea) return;
    setError(null);
    const wasComplete = tarea.percentComplete === 100;
    startTransition(async () => {
      const result = await updateTareaPercent(tarea.id, value, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        setPercentDraft(tarea.percentComplete);
        return;
      }
      if (value === 100 && !wasComplete) celebrateCompletion(anchorEl);
      router.refresh();
    });
  }
```

- [ ] **Step 3: Pasar el elemento desde los tres handlers del slider**

Reemplazar los handlers del `<input type="range">` (líneas 402-404):

```ts
              onMouseUp={(e) => commitPercent(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={() => commitPercent(percentDraft)}
              onKeyUp={() => commitPercent(percentDraft)}
```

por:

```ts
              onMouseUp={(e) => commitPercent(Number((e.target as HTMLInputElement).value), e.currentTarget)}
              onTouchEnd={(e) => commitPercent(percentDraft, e.currentTarget)}
              onKeyUp={(e) => commitPercent(percentDraft, e.currentTarget)}
```

- [ ] **Step 4: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"`
Expected: sin errores.

- [ ] **Step 5: Probar manualmente en dev**

Abrir una tarea hoja (sin subtareas) que no esté al 100%, subir el slider de porcentaje hasta 100 y soltar. Expected: confeti desde la barra de progreso. Bajar el slider de 100 a un valor menor y volver a subirlo a 100 debe celebrar cada vez que cruza hacia 100 (es una transición real cada vez). Mover el slider entre valores que no sean 100 (ej. 40 a 70) no debe celebrar.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"
git commit -F - <<'EOF'
feat(planificacion): celebrate completing a task via the percent slider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: Disparar confeti desde el checkbox de subtarea del modal

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx`

- [ ] **Step 1: Extender `toggleSubtarea` para recibir el elemento ancla y celebrar solo al marcar**

Reemplazar la función `toggleSubtarea` (líneas 320-333):

```ts
  function toggleSubtarea(sub: TareaListRow) {
    if (!tarea) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTareaPercent(sub.id, sub.percentComplete === 100 ? 0 : 100, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubtareas(await listSubtareas(tarea.id));
      await refreshTarea();
      router.refresh();
    });
  }
```

por:

```ts
  function toggleSubtarea(sub: TareaListRow, anchorEl: HTMLElement | null) {
    if (!tarea) return;
    setError(null);
    const willComplete = sub.percentComplete !== 100;
    startTransition(async () => {
      const result = await updateTareaPercent(sub.id, sub.percentComplete === 100 ? 0 : 100, tarea.proyectoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (willComplete) celebrateCompletion(anchorEl);
      setSubtareas(await listSubtareas(tarea.id));
      await refreshTarea();
      router.refresh();
    });
  }
```

- [ ] **Step 2: Pasar el elemento desde el botón del checkbox**

Reemplazar el botón de la línea 585:

```tsx
                    <button type="button" disabled={isPending} onClick={() => toggleSubtarea(sub)} className="shrink-0 text-muted-foreground">
```

por:

```tsx
                    <button type="button" disabled={isPending} onClick={(e) => toggleSubtarea(sub, e.currentTarget)} className="shrink-0 text-muted-foreground">
```

- [ ] **Step 3: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"`
Expected: sin errores.

- [ ] **Step 4: Probar manualmente en dev**

En el modal de una tarea con al menos una subtarea, marcar el checkbox de una subtarea no completada. Expected: confeti desde el checkbox. Desmarcar una subtarea que estaba al 100% no debe celebrar.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx"
git commit -F - <<'EOF'
feat(planificacion): celebrate completing a sub-task checklist item

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 6: Checkbox inline de completado en Lista

**Files:**
- Modify: `src/app/(app)/planificacion/proyectos/ListaView.tsx`
- Modify: `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`

- [ ] **Step 1: Agregar la columna de checkbox a `TaskRow`**

En `src/app/(app)/planificacion/proyectos/ListaView.tsx`, agregar `CheckSquare` y `Square` al import de `lucide-react` (línea 5):

```ts
import { CheckSquare, ChevronRight, Square } from "lucide-react";
```

Extender los props de `TaskRow` (líneas 33-47) con `onToggleComplete`:

```ts
function TaskRow({
  task,
  depth,
  childrenByParent,
  expandedIds,
  toggleExpanded,
  onSelect,
  onToggleComplete,
}: {
  task: TareaListRow;
  depth: number;
  childrenByParent: Map<string, TareaListRow[]>;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onSelect: (t: TareaListRow) => void;
  onToggleComplete: (taskId: string, proyectoId: string, rowEl: HTMLElement) => void;
}) {
```

Agregar una celda nueva al inicio de la fila, antes de la celda del Título (antes de la línea 54):

```tsx
        <td className="p-3">
          {task.hasChildren ? (
            <span className="inline-flex" title="Calculado a partir de las subtareas">
              <CheckSquare className="size-4 text-muted-foreground opacity-30" />
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (task.percentComplete === 100) return;
                onToggleComplete(task.id, task.proyectoId, e.currentTarget);
              }}
              className="shrink-0 text-muted-foreground"
            >
              {task.percentComplete === 100 ? (
                <CheckSquare className="size-4 text-[#04B1AF]" />
              ) : (
                <Square className="size-4" />
              )}
            </button>
          )}
        </td>
```

Propagar `onToggleComplete` en la recursión de subtareas (líneas 121-132, dentro del `children.map`):

```tsx
      {isExpanded &&
        children.map((child) => (
          <TaskRow
            key={child.id}
            task={child}
            depth={depth + 1}
            childrenByParent={childrenByParent}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            onSelect={onSelect}
            onToggleComplete={onToggleComplete}
          />
        ))}
```

- [ ] **Step 2: Extender `ListaView` para aceptar y propagar `onToggleComplete`, y agregar el encabezado de columna**

Extender los props de `ListaView` (líneas 137-149):

```ts
export function ListaView({
  tasks,
  allTasks,
  onSelect,
  onToggleComplete,
}: {
  tasks: TareaListRow[];
  allTasks: TareaListRow[];
  onSelect: (t: TareaListRow) => void;
  onToggleComplete: (taskId: string, proyectoId: string, rowEl: HTMLElement) => void;
}) {
```

Agregar una columna de encabezado vacía antes de "Título" (línea 177):

```tsx
            <th className="w-8 p-3"></th>
            <th className="p-3 font-medium">Título</th>
```

Pasar `onToggleComplete` al `TaskRow` raíz (líneas 189-197):

```tsx
            <TaskRow
              key={t.id}
              task={t}
              depth={0}
              childrenByParent={childrenByParent}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onSelect={onSelect}
              onToggleComplete={onToggleComplete}
            />
```

- [ ] **Step 3: Agregar `toggleListaComplete` en `ProyectosWorkspace` y conectarlo**

En `src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx`, si el import de `updateTareaPercent` no quedó ya del Task 3, agregarlo ahora (línea 6):

```ts
import { updateTareaFecha, updateTareaPercent, type EstadoOption, type PlanificacionRow, type TareaListRow } from "./actions";
```

Agregar la función junto a `dropEstado`:

```ts
  function toggleListaComplete(taskId: string, proyectoId: string, rowEl: HTMLElement) {
    startTransition(async () => {
      const result = await updateTareaPercent(taskId, 100, proyectoId);
      if (!result.error) celebrateCompletion(rowEl);
      router.refresh();
    });
  }
```

Nota: a diferencia de `dropEstado`, esta función no depende de `onDropEstado` — `updateTareaPercent` solo necesita el `proyectoId` propio de la tarea (ya disponible en cada fila), así que el checkbox de Lista funciona igual en la vista de un proyecto específico que en la pantalla "Mis tareas" que mezcla varios proyectos. Si hay un error (ej. la tarea resultó tener subtareas que esta carga local no conocía), no se celebra y `router.refresh()` simplemente vuelve a mostrar el porcentaje real — no hay mensaje de error visible en Lista, consistente con que esta vista no tiene hoy ningún otro slot de error.

Pasar la prop a `ListaView` (línea 214):

```tsx
      {view === "lista" && (
        <ListaView tasks={rootFilteredTasks} allTasks={tasks} onSelect={setSelected} onToggleComplete={toggleListaComplete} />
      )}
```

- [ ] **Step 4: Typecheck y lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/planificacion/proyectos/ListaView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"`
Expected: sin errores.

- [ ] **Step 5: Probar manualmente en dev**

En la vista Lista, marcar el checkbox de una tarea hoja no completada. Expected: confeti desde la fila, la fila NO abre el modal de detalle. En una tarea que tiene subtareas (columna de checkbox en gris, de solo lectura) confirmar que no hay botón clickeable. Hacer clic sobre el checkbox ya marcado (100%) no debe hacer nada (no se desmarca desde aquí).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/planificacion/proyectos/ListaView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx"
git commit -F - <<'EOF'
feat(planificacion): add inline complete checkbox to Lista rows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
```

---

## Task 7: Verificación final y despliegue a preview

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Typecheck y lint de todos los archivos tocados**

```bash
bunx tsc --noEmit
bunx eslint "src/app/(app)/planificacion/proyectos/celebrate.ts" "src/app/(app)/planificacion/proyectos/TableroView.tsx" "src/app/(app)/planificacion/proyectos/ProyectosWorkspace.tsx" "src/app/(app)/planificacion/proyectos/TareaDetailModal.tsx" "src/app/(app)/planificacion/proyectos/ListaView.tsx"
```

Expected: sin errores en ningún comando.

- [ ] **Step 2: Lista de smoke-test manual completa** (del spec, sección Testing)

- Arrastrar una tarjeta en Tablero a la columna "Completado" → confeti sale desde la posición de la tarjeta soltada.
- Arrastrar una tarjeta ya en "Completado" a otra columna "Completado" → no debe celebrar dos veces por la misma tarea sin pasar antes por un estado no completado.
- Subir el slider de % a 100 en el modal → confeti desde la barra de progreso.
- Marcar un checkbox de subtarea al 100% en el modal → confeti desde el checkbox.
- Desmarcar una subtarea que estaba al 100% → NO debe celebrar.
- Marcar el nuevo checkbox inline de una fila en Lista → confeti desde la fila; el checkbox no debe abrir el modal de detalle.
- Intentar ver el checkbox inline en una fila que es tarea padre (tiene subtareas) → debe mostrarse como solo-lectura, no un checkbox.
- Activar "reducir movimiento" en el sistema operativo (Windows: Configuración > Accesibilidad > Efectos visuales) y repetir los casos anteriores → debe verse el pulso CSS en vez de confeti, sin que la app quede rota.
- Recargar la página con una tarea ya completada (abrir su modal, o simplemente listarla) → no debe celebrar solo por mostrarse.

- [ ] **Step 3: Deploy a preview**

```bash
bunx vercel
```

Expected: build exitoso, URL de preview devuelta. Repetir la lista de smoke-test del Step 2 sobre esa URL.

- [ ] **Step 4: Confirmar con el usuario antes de producción**

No ejecutar `bunx vercel --prod` hasta que el usuario confirme explícitamente ("sí, despliega") después de probar el preview.

---

## Self-Review

**Cobertura del spec:** Sección 1 (`celebrate.ts`) → Task 2. Sección 2.1 (Tablero) → Task 3. Sección 2.2 (slider) → Task 4. Sección 2.3 (checkbox subtarea) → Task 5. Sección 2.4 (Lista) → Task 6. Sección 3 (manejo de errores: nunca celebrar antes de confirmación del servidor) → verificado en los 4 puntos de disparo (Tasks 3-6, cada uno celebra solo dentro del branch de éxito). Sección 4 (testing) → Task 7, lista copiada verbatim del spec. "Fuera de alcance" del spec (sonido, toasts, celebración a nivel de proyecto) → no se agregó ningún task para ellos, correcto.

**Escaneo de placeholders:** ninguno — cada paso trae código completo y comandos exactos.

**Consistencia de tipos:** `celebrateCompletion(anchorEl: Element | null)` definido en Task 2 se usa consistentemente como `celebrateCompletion(cardEl)`, `celebrateCompletion(anchorEl)`, `celebrateCompletion(rowEl)` en los Tasks 3-6 — todos `HTMLElement | null`, que es un subtipo válido de `Element | null`. `onToggleComplete` se define igual en `ListaView` y `TaskRow` (Task 6) y se invoca con la misma firma `(taskId, proyectoId, rowEl)` desde `ProyectosWorkspace.toggleListaComplete`.
