# Dashboard de avances (por proyecto) — Design

**Contexto:** Nuevo ítem del levantamiento de patrones de Monday.com aplicado a `Proyectos` (no estaba en la lista original de 6 sub-proyectos; se agrega ahora como su propio sub-proyecto). Alcance acordado con el usuario: primero el dashboard de UN proyecto (este spec); una vista general cruzando todos los proyectos en la pantalla "Mis proyectos" queda como sub-proyecto futuro, fuera de alcance aquí.

**Goal:** Agregar un 5to modo de vista — "Dashboard" — junto a Lista/Tablero/Calendario/Jerarquía dentro de `ProyectosWorkspace.tsx`, que muestre 4 widgets de avance para el proyecto actual: avance general, desglose por estado, carga por responsable, y tareas vencidas/por vencer. Sin pedir nada nuevo al servidor — todo se deriva en el cliente de los `tasks`/`estados` que `ProyectosWorkspace` ya tiene cargados.

**Tech Stack:** Sin librería de gráficos nueva (no hay ninguna instalada hoy en `package.json`, y `ComplianceView.tsx` — el único otro lugar de la app con un patrón de "progreso por período" — tampoco usa una). Los widgets de dona se hacen con SVG plano (técnica `stroke-dasharray`/`stroke-dashoffset`, sin dependencias). React/Next.js 16 App Router, Bun.

---

## 1. Dónde vive

Nuevo archivo `src/app/(app)/planificacion/proyectos/DashboardView.tsx`, mismo patrón que `CalendarioView.tsx`/`JerarquiaView.tsx`: componente presentacional que recibe `tasks: TareaListRow[]` y `estados: EstadoOption[]` como props, sin mutaciones propias (ningún widget de este dashboard es editable — es de solo lectura, a diferencia de Lista/Tablero).

En `ProyectosWorkspace.tsx`:
- `VIEW_OPTIONS` gana una 5ta entrada `{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }` (ícono de `lucide-react`, ya una dependencia).
- `ViewMode` gana `"dashboard"`.
- Igual que Jerarquía (que necesita el árbol completo, no solo raíces), Dashboard recibe `filteredTasks` (no `rootFilteredTasks`) — así respeta el filtro de fecha "Desde/Hasta" ya compartido por las otras 4 vistas, consistente con ese diseño existente.
- Nuevo render condicional: `{view === "dashboard" && <DashboardView tasks={filteredTasks} estados={estados} />}`.

## 2. Los 4 widgets

Layout: grilla 2x2 en `md:` en adelante, apilados en celular (`grid grid-cols-1 gap-4 md:grid-cols-2`), cada widget en su propia tarjeta (`rounded-2xl border bg-card p-4 shadow-sm`, mismo lenguaje visual que el resto de `Proyectos`).

**2.1 Avance general** — reutiliza el mismo cálculo que ya existe en la página de proyecto (`proyectoPercent`: promedio del `percentComplete` de las tareas raíz), pero esta vez calculado dentro de `DashboardView` a partir de `tasks.filter(t => !t.parentTaskId)` (ya que el widget solo recibe `tasks`, no repite la lógica de la página). Se muestra como una dona SVG grande (un solo segmento, color `#04B1AF`, resto en gris `bg-muted`) con el número `{percent}%` al centro.

**2.2 Desglose por estado** — cuenta TODAS las tareas (raíz + subtareas, cada una tiene su propio `estadoId` independientemente de que su `percentComplete` sea un rollup) agrupadas por `estadoName`/`estadoColor`. Dona SVG multi-segmento (un segmento por estado, en su color real vía `estadoColor`), más una lista a la derecha con `• {color} {estadoName} — {count}`. Tareas sin estado (`estadoId === null`) se agrupan como "Sin estado" en gris.

**2.3 Carga por responsable** — cuenta solo tareas **hoja** (`!t.hasChildren`) agrupadas por `assigneeName` (o "Sin asignar" si `assigneeId` es null), ya que una tarea con subtareas no es "trabajo" directo de nadie — ya es la misma distinción que usa el checkbox de Lista. Barras horizontales (`<div>` con `width: {count/max*100}%`, color `#04B1AF`), ordenadas de mayor a menor carga, con el nombre y el número al lado de cada barra.

**2.4 Vencidas / por vencer** — dos números grandes arriba (tareas con `dueDate` antes de hoy = "Vencidas"; tareas con `dueDate` entre hoy y +7 días = "Por vencer"), excluyendo siempre tareas con `percentComplete === 100` (una tarea ya completada no cuenta como vencida aunque su fecha haya pasado). Debajo, una lista de hasta 5 tareas (las más urgentes primero: vencidas antes que por-vencer, y dentro de cada grupo la fecha más próxima primero), cada fila es un botón que llama a `onSelect(task)` (mismo patrón que abre el modal desde Lista/Tablero) para abrir esa tarea directamente.

## 3. Componente de dona reutilizable

`DashboardView.tsx` incluye una función interna `Donut({ segments, centerLabel }: { segments: { value: number; color: string }[]; centerLabel?: string })` — un único componente SVG reutilizado por 2.1 y 2.2 (2.1 le pasa un solo segmento). Técnica: un `<circle>` de `r` fijo por segmento, `strokeDasharray={`${length} ${circumference - length}`}`, acumulando el `strokeDashoffset` de cada segmento sucesivo para que no se superpongan. `centerLabel` se dibuja con un `<div>` posicionado absolutamente centrado sobre el SVG (contenedor `relative`, label `absolute inset-0 flex items-center justify-center`) en vez de `<text>` SVG, para alineación y tipografía consistente con el resto de la UI (fuente del sistema, mismo tamaño que otros números grandes de la app) sin pelear con el sistema de coordenadas del SVG.

## 4. Manejo de errores

No hay escritura al servidor en este sub-proyecto — todos los widgets son cálculos puros sobre props ya cargadas. Único caso borde: proyecto sin tareas (`tasks.length === 0`) → cada widget muestra su propio estado vacío breve ("Sin tareas todavía", "Sin tareas vencidas", etc.) en vez de una dona/barra vacía rara. División por cero en los porcentajes (0 tareas raíz) se guarda explícitamente (mostrar "—" o 0% en vez de `NaN`).

## 5. Testing

Sin suite de tests automatizados, mismo precedente que el resto de `Proyectos`: `bunx tsc --noEmit` + `bunx eslint` por archivo tocado. Smoke-test manual:

- Abrir un proyecto con tareas en varios estados, con subtareas, con algunas vencidas → cada uno de los 4 widgets muestra números coherentes con lo que ya se ve en Lista/Tablero.
- Proyecto vacío (sin tareas) → cada widget muestra su estado vacío, sin errores ni `NaN`/`Infinity` en pantalla.
- Cambiar el filtro de fecha "Desde/Hasta" (ya compartido por las otras vistas) → los 4 widgets se recalculan con el subconjunto filtrado.
- Hacer clic en una tarea de la lista de "Vencidas/por vencer" → abre el modal de detalle de esa tarea.
- Redimensionar a celular → la grilla pasa a 1 columna, nada se corta ni desborda horizontalmente.

## Fuera de alcance

- Vista general cruzando todos los proyectos en la pantalla "Mis proyectos" — sub-proyecto futuro.
- Cualquier librería de gráficos de terceros.
- Widgets editables o con drill-down más allá de abrir el modal de una tarea desde la lista de vencidas.
- Exportar el dashboard (ya existe exportar CSV de avances en otro botón, sin relación con este dashboard).
- Los otros 4 ítems pendientes del backlog de Monday.com (log de actividad, menciones, tiempo real, centro de notificaciones, menú de acciones rápidas) — specs independientes.
