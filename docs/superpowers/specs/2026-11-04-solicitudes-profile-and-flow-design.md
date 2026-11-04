# Solicitudes de permisos: perfil, últimas vacaciones y flujo de aprobación

## Contexto

La página `/solicitudes/vacaciones` ya tiene (desde el plan anterior, commit `812f43b`)
4 tarjetas de resumen, un encabezado simple y una tabla filtrable. El usuario pidió
tres mejoras adicionales sobre ese trabajo:

1. Que la página se adapte mejor al ancho disponible (hoy el contenedor es
   `max-w-4xl` y, cuando se ocultan las tarjetas condicionales "Por aprobar" o
   "Próxima vacación", el grid deja hueco vacío en vez de redistribuir).
2. Mostrar la foto de perfil del usuario y su tiempo en la empresa.
3. Mostrar la última vacación ya tomada (no solo la próxima), y permitir ver el
   flujo de aprobación (solicitado → jefe directo → RRHH) de cualquier solicitud
   de la tabla con un clic.

No se necesita ninguna migración: todos los campos ya existen en `contacts`
(`photo_url`, `hire_date`) y en `vacation_requests` (`created_at`,
`supervisor_decision`, `supervisor_decided_at`, `supervisor_comments`,
`rrhh_decision`, `rrhh_decided_at`, `rrhh_comments`, `rrhh_period_confirmed`,
`rrhh_has_current_vacation`, `rrhh_is_advance`).

## Diseño

### 1. Encabezado de perfil

Nuevo componente `SolicitudesProfileHeader.tsx` (presentacional, sin lógica),
una barra horizontal (no la tarjeta grande y centrada de `MyProfileCard`, que
además arrastra el cálculo de `schedule_line` que esta página no necesita):

```tsx
interface SolicitudesProfileHeaderProps {
  name: string;
  position: string | null;
  photoUrl: string | null;
  tenure: string | null; // ya formateado, o null si no hay hire_date
}
```

Renderiza un `Avatar` (`size-14`) a la izquierda y, a la derecha, el nombre en
negrita, el puesto debajo en `text-sm text-muted-foreground`, y si `tenure` no
es null, "· {tenure} en la empresa" en la misma línea del puesto. Usa
`getInitials` de `@/lib/contacts` para el fallback del avatar, igual que
`MyProfileCard`. Van dentro de un `<div className="flex items-center gap-4 rounded-2xl border p-4">`.

`page.tsx` obtiene estos datos con una consulta nueva (mismo patrón que
`src/app/(app)/page.tsx:61-66`, sin el join de horarios):

```ts
const { data: myContact } = await supabase
  .from("contacts")
  .select("first_name, last_name, position, photo_url, hire_date")
  .eq("email", user!.email!)
  .maybeSingle();
```

Si `myContact` es null (usuario sin fila en `contacts`), el encabezado no se
renderiza (mismo patrón defensivo que la home page).

### 2. Última vacación tomada + rango completo en "Próxima vacación"

En `src/lib/vacationRequestSummary.ts`:

- `findNextApprovedVacationDate` se reemplaza por **`findNextApprovedVacation`**,
  que devuelve `{ date_from: string; date_to: string } | null` en vez de solo
  el string de inicio (mismo filtro que antes: propia, `tipo === "vacaciones"`,
  `status === "aprobado"`, `date_from > todayIso`, la de `date_from` más
  próxima).
- Nueva función **`findLastTakenVacation`**, misma firma de entrada que
  `findNextApprovedVacation`, devuelve `{ date_from: string; date_to: string } | null`:
  entre las filas propias con `tipo === "vacaciones"`, `status === "aprobado"`,
  y `date_from <= todayIso` (ya empezó, sea que ya terminó o esté en curso), se
  toma la de `date_from` más reciente (la más próxima a hoy hacia atrás). Si no
  hay ninguna, `null`.
- Nueva función pura **`formatFechaEs(dateIso: string): string`**: recibe una
  fecha `"YYYY-MM-DD"` y devuelve `"15 de noviembre de 2026"`, parseando el
  string manualmente (`split("-")`) y formateando con
  `new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-DO", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })`
  — fuerza UTC explícitamente para no depender de la zona horaria del servidor
  ni del navegador (mismo cuidado que ya se aplicó en `daysBetweenInclusive`).

En `SolicitudesSummaryCards.tsx`, las tarjetas correspondientes cambian su
prop de `string | null` a `{ date_from: string; date_to: string } | null`, y
el texto pasa a ser siempre un rango con fechas completas en ambos extremos:
"Del {formatFechaEs(date_from)} al {formatFechaEs(date_to)}" (sin intentar
abreviar cuando caen en el mismo mes — más simple y sin casos borde). La
tarjeta "Última vacación" usa el mismo color azul y el ícono `Plane` en
espejo (o `History`, a elegir en la implementación), y solo se renderiza si
`lastVacation` no es null.

### 3. Flujo de aprobación por solicitud

Nuevo archivo puro **`src/lib/vacationRequestFlow.ts`**:

```ts
export type FlowStepState = "completed" | "rejected" | "pending" | "not_reached";

export interface FlowStep {
  label: string;
  state: FlowStepState;
  decidedAt: string | null; // timestamptz ISO, o null
  comments: string | null;
  extra: string[]; // líneas adicionales (ej. detalles de RRHH para vacaciones)
}

export interface RequestFlowInput {
  tipo: string;
  status: string;
  created_at: string;
  supervisor_decision: string | null;
  supervisor_decided_at: string | null;
  supervisor_comments: string | null;
  rrhh_decision: string | null;
  rrhh_decided_at: string | null;
  rrhh_comments: string | null;
  rrhh_period_confirmed: string | null;
  rrhh_has_current_vacation: boolean | null;
  rrhh_is_advance: boolean | null;
}

export function deriveRequestFlowSteps(request: RequestFlowInput): FlowStep[]
```

Lógica de `deriveRequestFlowSteps`:

1. **"Solicitado"** — siempre `state: "completed"`, `decidedAt: request.created_at`,
   `comments: null`, `extra: []`.
2. **"Jefe directo"**:
   - Si `request.status === "pendiente_supervisor"` → `state: "pending"`.
   - Si `request.supervisor_decision === "aprobado"` → `state: "completed"`.
   - Si `request.supervisor_decision === "rechazado"` → `state: "rejected"`.
   - `decidedAt: request.supervisor_decided_at`, `comments: request.supervisor_comments`.
3. **"RRHH"**:
   - Si el jefe directo rechazó (`supervisor_decision === "rechazado"`) →
     `state: "not_reached"` (nunca llegó a esta etapa), `decidedAt: null`,
     `comments: null`.
   - Si no ha llegado todavía (`status === "pendiente_supervisor"`) →
     también `state: "not_reached"`.
   - Si `status === "pendiente_rrhh"` → `state: "pending"`.
   - Si `rrhh_decision === "aprobado"` → `state: "completed"`.
   - Si `rrhh_decision === "rechazado"` → `state: "rejected"`.
   - `decidedAt: request.rrhh_decided_at`, `comments: request.rrhh_comments`.
   - `extra`: solo si `tipo === "vacaciones"` y el paso no es `"not_reached"`/`"pending"`,
     agrega una línea por cada dato no nulo: `rrhh_period_confirmed` → `"Período confirmado: {valor}"`;
     `rrhh_has_current_vacation === true` → `"Tenía vacaciones vigentes"`;
     `rrhh_is_advance === true` → `"Vacaciones por adelantado"`.

Devuelve siempre un array de exactamente 3 `FlowStep` en ese orden.

**UI**: nuevo componente cliente `RequestFlowDialog.tsx`, envuelve un botón
ícono (`variant="ghost" size="icon-sm"`, ícono `History` de lucide-react,
`aria-label="Ver flujo de la solicitud"`) como `DialogTrigger`, y el
`DialogContent` renderiza un `DialogTitle` ("Flujo de la solicitud") seguido
de los 3 pasos en una lista vertical: cada paso muestra un ícono según su
`state` (`completed` → `CheckCircle2` verde, `rejected` → `XCircle` rojo,
`pending` → `Clock` ámbar, `not_reached` → `MinusCircle` gris), el `label`,
la fecha formateada con `formatFechaEs` si `decidedAt` no es null (solo la
parte de fecha: `decidedAt.slice(0, 10)` antes de pasarla a `formatFechaEs`,
ya que `decidedAt` es un timestamptz), el `comments` si no es null, y cada
línea de `extra`. Los pasos conectados con un borde izquierdo vertical
(`border-l-2`) entre íconos, como una línea de tiempo.

`SolicitudesTable.tsx` agrega una columna nueva "Flujo" al final de la
tabla (después de la columna de acciones existente) con este botón por fila,
para cualquier tipo y estado de solicitud — no solo vacaciones ni solo
pendientes. `SolicitudRequestRow` se extiende con los campos de
`RequestFlowInput` (todos ya vienen en `allRequests` porque `page.tsx` ya
hace `select("*")` sobre `vacation_requests`, no se necesita una consulta
nueva).

### 4. Responsive y ancho de página

- `page.tsx`: el contenedor pasa de `max-w-4xl` a `max-w-5xl`.
- `SolicitudesSummaryCards.tsx`: ahora hay hasta 5 tarjetas (antes 4): las 2
  siempre visibles ("En trámite", "Días aprobados") más 3 condicionales ("Por
  aprobar", "Última vacación", "Próxima vacación"). El grid cambia de
  `grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` (fijo en 4 columnas) a
  `grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3`, de forma que con 3, 4 o 5
  tarjetas visibles la última fila casi siempre tiene al menos 2 tarjetas en
  vez de 1 sola dejando espacio vacío (se verifica manualmente en el smoke
  test para las combinaciones reales; no hay una regla CSS que lo garantice
  para cualquier combinación — ver "Fuera de alcance").
- Íconos decorativos de las tarjetas (`Hourglass`, `ClipboardCheck`,
  `CalendarCheck`, `Plane`, el de "Última vacación") reciben `aria-hidden="true"`.

## Fuera de alcance

- Balance de vacaciones por antigüedad (sigue siendo Fase 2, sin cambios).
- Una solución de grid perfectamente auto-ajustable para cualquier número de
  tarjetas visibles (0 a 5) — se usa un breakpoint razonable (`xl:grid-cols-3`)
  en vez de CSS Grid `auto-fit`/`auto-fill` con `minmax`, porque mezclar eso
  con el ancho fijo de la tarjeta de "días aprobados" (que internamente ya
  tiene dos columnas) complica más de lo que vale para este alcance.
- Edición o reenvío de notificaciones desde el diálogo de flujo — es de solo
  lectura.
- Mostrar el flujo dentro de la propia fila (expandible inline) en vez de un
  diálogo — un diálogo es más simple de implementar sobre la tabla existente
  y no reduce el ancho disponible para las demás columnas.

## Pruebas

- `src/lib/vacationRequestSummary.test.ts`: actualizar los tests existentes
  de `findNextApprovedVacationDate` para la nueva firma de
  `findNextApprovedVacation` (ahora devuelve rango), agregar tests para
  `findLastTakenVacation` (ninguna tomada → null; una tomada en el pasado;
  una vacación en curso ahora mismo — `date_from <= hoy <= date_to` — cuenta
  como "última tomada", no como próxima; varias pasadas → la más reciente
  gana) y para `formatFechaEs` (fecha de un dígito de día/mes se rellena
  bien, por ejemplo `"2026-01-05"` → `"5 de enero de 2026"`).
- Nueva suite `src/lib/vacationRequestFlow.test.ts` para
  `deriveRequestFlowSteps`: pendiente de supervisor (pasos 2 y 3 en los
  estados correctos), rechazado por supervisor (paso 3 en `not_reached`),
  pendiente de RRHH, aprobado por RRHH con y sin los 3 campos de
  clasificación de vacaciones (y confirmar que esos campos de `extra` NO
  aparecen para un tipo distinto de `"vacaciones"` aunque vengan con datos),
  rechazado por RRHH.
- Verificación manual:
  1. Confirmar que el encabezado de perfil muestra la foto (o las iniciales
     si no hay foto), el nombre, el puesto y el tiempo en la empresa
     correctos para el usuario que inició sesión.
  2. Con una vacación en curso ahora mismo, confirmar que aparece como
     "Última vacación" (no como "Próxima").
  3. Con una vacación futura y otra ya pasada, confirmar que ambas tarjetas
     muestran el rango completo de fechas en español.
  4. Hacer clic en el ícono de flujo de una solicitud en cada estado
     (pendiente de jefe, pendiente de RRHH, aprobada, rechazada por jefe,
     rechazada por RRHH) y confirmar que los 3 pasos muestran el estado,
     fecha y comentario correctos.
  5. En una vacación aprobada por RRHH, confirmar que el paso "RRHH" muestra
     el período confirmado y los indicadores de vacaciones vigentes/adelanto
     cuando aplican.
  6. Revisar en una pantalla ancha (desktop) y una angosta (móvil) que el
     encabezado, las tarjetas y la tabla se ven bien y no hay desbordamiento
     horizontal de la página.
