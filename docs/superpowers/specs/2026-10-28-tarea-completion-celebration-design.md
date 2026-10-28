# Celebración de tareas completadas (confeti) — Design

**Contexto:** Primer de cinco sub-proyectos derivados de un levantamiento de patrones de Monday.com aplicado al sistema "Proyectos" ya en producción (`docs/superpowers/specs/2026-10-26-planificacion-proyectos-design.md`, `2026-10-27-planificacion-percent-estados-color-design.md`). Los otros cuatro (log de actividad, menciones en comentarios, tiempo real) se diseñan por separado, cada uno con su propio spec/plan. La vista de Calendario, que también estaba en la lista original, ya existe en producción (`CalendarioView.tsx`, commit `c1cd4df`) y queda fuera de alcance.

**Goal:** Cuando una tarea pasa a 100% de avance (lo que ya dispara su transición automática al estado "Completado" vía la lógica existente de `updateTareaPercent`/`updateTareaEstado`), mostrar una animación de celebración breve y localizada (confeti), respetando la preferencia de accesibilidad "reducir movimiento" del sistema operativo del usuario.

**Architecture:** Un módulo de utilidad sin UI propia (`celebrate.ts`) centraliza la decisión de cómo celebrar (confeti vs. feedback estático) y la invocación de `canvas-confetti`. Los cuatro puntos de la interfaz donde una tarea puede llegar a 100% llaman a esta función tras una actualización exitosa, comparando el valor anterior contra el nuevo para celebrar solo en la transición hacia 100%, nunca al simplemente mostrar una tarea ya completada.

**Tech Stack:** `canvas-confetti` (nueva dependencia, instalada con `bun add canvas-confetti` + `bun add -d @types/canvas-confetti`), `window.matchMedia('(prefers-reduced-motion: reduce)')` nativo, sin librerías adicionales de animación.

---

## 1. Módulo `celebrate.ts`

Nuevo archivo: `src/app/(app)/planificacion/proyectos/celebrate.ts`. Sin directiva `"use client"` en la cabecera del archivo en sí (es solo lógica, no un componente), pero solo se invoca desde código que ya corre en el cliente (handlers de evento dentro de componentes `"use client"` existentes), igual que `progress.ts`.

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

`colors` reutiliza el teal de marca (`#04B1AF`, ya usado en todo `Proyectos`) junto con verde/amarillo/azul marino para que el efecto se sienta de la casa y no genérico.

## 2. Puntos de disparo

Los cuatro lugares llaman a `celebrateCompletion` con el elemento DOM relevante, comparando el `percentComplete` previo contra el nuevo. Ya existe en los cuatro casos una variable con el valor anterior disponible localmente (el componente conoce `tarea`/`task`/`sub` antes de la actualización), así que la comparación no requiere estado nuevo.

**2.1 Tablero — soltar una tarjeta sobre una columna "Completado"**
`ProyectosWorkspace.tsx`, función `dropEstado` (línea ~131). Hoy firma `(taskId: string, columnKey: string)`. Se extiende el contrato `onDrop` de `TableroView` para pasar el evento nativo de drop y así capturar el elemento soltado:

- `TableroView.tsx`: el prop `onDrop` cambia de `(taskId: string, columnKey: string) => void` a `(taskId: string, columnKey: string, cardEl: HTMLElement | null) => void`. En el handler `onDrop` del contenedor de columna (línea ~53), pasar `e.currentTarget` del elemento de la tarjeta no es directo porque el evento ocurre sobre la columna, no la tarjeta — en su lugar, se guarda la referencia del elemento arrastrado en el mismo `onDragStart` que ya fija `draggingId` (línea ~78), vía `event.currentTarget as HTMLElement`, en un nuevo estado local `draggingEl`. `onDrop` del contenedor pasa `draggingEl` junto a `id`.
- `ProyectosWorkspace.tsx`, `dropEstado(taskId, columnKey, cardEl)`: busca el estado destino en `estados` (prop ya recibido) por `id === columnKey`; si `estado.kind === "completado"`, busca la tarea en `tasks` por `taskId` para leer su `percentComplete` previo, llama a `onDropEstado`, y si el resultado no trae `error` y el percent previo era distinto de 100, llama `celebrateCompletion(cardEl)`.

**2.2 Modal de detalle — slider/input de porcentaje llega a 100**
`TareaDetailModal.tsx`, handler que llama `updateTareaPercent` (línea ~224). Tras `result` sin `error`, si `value === 100 && tarea.percentComplete !== 100`, llamar `celebrateCompletion(percentBarRef.current)` donde `percentBarRef` es un nuevo `useRef<HTMLDivElement>(null)` adjunto al contenedor de la barra de progreso existente (línea ~388).

**2.3 Modal de detalle — checkbox de subtarea marcado al 100%**
`TareaDetailModal.tsx`, handler del checkbox de subtarea (línea ~324, ya calcula `sub.percentComplete === 100 ? 0 : 100`). Cuando el valor nuevo calculado es 100 (es decir, se está marcando, no desmarcando) y el resultado no trae error, llamar `celebrateCompletion(event.currentTarget)` pasando el elemento del checkbox que disparó el click.

**2.4 Lista — nuevo checkbox inline por fila**
`ListaView.tsx` no tiene hoy ningún control de completado inline (solo barra de progreso + clic abre el modal). Se agrega una celda nueva al inicio de cada fila con un checkbox (`<input type="checkbox" checked={task.percentComplete === 100} />` estilizado, `onClick` con `e.stopPropagation()` para no disparar el `onSelect` de la fila que abre el modal). Al marcar (no al desmarcar), llama a `updateTareaPercent(task.id, 100, task.proyectoId)` (misma acción ya usada en el modal) y, si no hay error, `celebrateCompletion(e.currentTarget)`.

Este checkbox solo aparece quando la tarea es de tipo hoja (no tiene subtareas) — para una tarea con `hasChildren`, el porcentaje es de solo lectura (regla ya establecida en el sistema de percent/estado), así que la celda muestra un ícono de solo-lectura en vez de un checkbox, consistente con cómo `TareaDetailModal` ya distingue tareas hoja de tareas padre.

## 3. Manejo de errores

Si `updateTareaPercent`/`onDropEstado` devuelve `error`, no se llama `celebrateCompletion` en ningún punto — la celebración solo ocurre tras una escritura confirmada en el servidor, nunca de forma optimista. Esto es consistente con el patrón ya usado en estos mismos handlers, que hoy revierten el estado local en caso de error.

## 4. Testing

Sin suite de tests automatizados para esta feature, siguiendo el precedente ya establecido para todo el sistema de `Proyectos` (verificación vía `bunx tsc --noEmit` + `bunx eslint` por archivo tocado). Lista de smoke-test manual al final del plan de implementación:

- Arrastrar una tarjeta en Tablero a la columna "Completado" → confeti sale desde la posición de la tarjeta soltada.
- Arrastrar una tarjeta ya en "Completado" a otra columna "Completado" (no debería poder pasar, pero si por algún motivo el drop es sobre la misma columna) → no debe celebrar dos veces por la misma tarea sin pasar antes por un estado no completado.
- Subir el slider de % a 100 en el modal → confeti desde la barra de progreso.
- Marcar un checkbox de subtarea al 100% en el modal → confeti desde el checkbox.
- Desmarcar una subtarea que estaba al 100% → NO debe celebrar.
- Marcar el nuevo checkbox inline de una fila en Lista → confeti desde la fila; el checkbox no debe abrir el modal de detalle.
- Intentar ver el checkbox inline en una fila que es tarea padre (tiene subtareas) → debe mostrarse como solo-lectura, no un checkbox.
- Activar "reducir movimiento" en el sistema operativo (Windows: Configuración > Accesibilidad > Efectos visuales) y repetir los casos anteriores → debe verse el pulso CSS en vez de confeti, sin que la app quede rota si `canvas-confetti` nunca se invoca.
- Recargar la página con una tarea ya completada (abrir su modal, o simplemente listarla) → no debe celebrar solo por mostrarse.

## Fuera de alcance

- Sonido.
- Sistema de toasts/notificaciones (no existe hoy en el código; no se introduce solo para este feature).
- Celebración a nivel de proyecto completo (promedio de tareas llegando a 100%) — se descartó explícitamente a favor de celebrar por tarea individual.
- Los otros 4 sub-proyectos del levantamiento de Monday.com (log de actividad, menciones, tiempo real) — specs independientes.
