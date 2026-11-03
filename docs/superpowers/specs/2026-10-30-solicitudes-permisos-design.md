# Solicitudes de Permisos (Fase 1): ampliar el módulo de "Vacaciones"

## Contexto

El módulo actual en `/solicitudes/vacaciones` (etiqueta "Vacaciones" en el
menú, bajo la sección "Solicitudes") solo está pensado para vacaciones: su
formulario (`NewVacationRequestDialog.tsx`) pide Período correspondiente,
Días solicitados, Fecha de regreso y Días pendientes — campos que no tienen
sentido para, por ejemplo, un permiso médico de un día. La tabla
`vacation_requests` solo distingue `tipo in ('vacaciones', 'permiso')`.

La empresa maneja 6 tipos de permiso reconocidos (según el infográfico
interno "Solicitud de Permisos y Vacaciones"): Personal, Familiar, Médico,
Pérdida, Trámites, y Vacaciones — más un séptimo tipo "Otro" para lo que no
encaje, con una descripción libre. El flujo de aprobación ya es el correcto
y coincide con la política de la empresa: el jefe directo aprueba primero
(con firma digital), y luego pasa a Talento Humano (RRHH) para la
aprobación final — esto **no cambia** en esta fase.

Esta fase **no** incluye el cálculo automático de días de vacaciones
disponibles por antigüedad del empleado, ni una vista de gestión de balances
para RRHH — eso es la Fase 2, un proyecto separado que se diseña
inmediatamente después de que esta fase quede implementada.

## Objetivo

Ampliar el módulo para que cubra los 7 tipos de solicitud, con un
formulario distinto según el tipo, soporte para adjuntar un documento, y
renombrar la etiqueta visible de "Vacaciones" a "Permisos" — sin romper
enlaces existentes (correos ya enviados, permisos de roles ya configurados).

## Diseño

### 1. Base de datos (`vacation_requests`)

Migración que:

- Reemplaza el check constraint de `tipo` para aceptar:
  `'vacaciones', 'personal', 'familiar', 'medico', 'perdida', 'tramites', 'otro'`
  (se elimina el viejo valor genérico `'permiso'` — cualquier fila existente
  con `tipo = 'permiso'` se migra a `'otro'` como parte de la misma
  migración, ya que no hay forma de saber a cuál de los 6 tipos nuevos
  correspondía cada una).
- Relaja `days_requested` y `return_date` a nullable (hoy son `not null`).
  Solo son obligatorios, a nivel de aplicación, cuando `tipo = 'vacaciones'`.
- No se agrega una columna nueva para "motivo": se reutiliza la columna
  `notes` ya existente. Es opcional cuando `tipo = 'vacaciones'` (como hoy,
  "Observaciones") y obligatoria a nivel de aplicación para los otros 6
  tipos (se le cambia la etiqueta a "Motivo" en el formulario para esos
  casos).
- Agrega una columna nueva `attachment_path text` (nullable) — ruta dentro
  de un nuevo bucket de Supabase Storage, mismo patrón que
  `vacation-request-signatures` (que ya usa este mismo módulo para las
  firmas de aprobación). El bucket nuevo se llama
  `vacation-request-attachments`.

La tabla y el módulo de permisos (`modules.key = 'solicitudes_vacaciones'`)
**no se renombran** — son identificadores internos que ya tienen RLS,
RPCs (`get_ponchador_approved_leave`, etc.) y `role_profile_permissions`
construidos sobre ellos. Renombrarlos es un cambio de mayor riesgo que no
aporta nada visible al usuario; solo cambia la etiqueta en el menú y los
títulos de página.

### 2. Formulario de nueva solicitud (`NewVacationRequestDialog.tsx`)

El selector de "Tipo" pasa de 2 botones a 7, agrupados igual (fila de
botones tipo toggle, como ya existe). Según el tipo elegido:

- **`vacaciones`**: formulario actual, sin ningún cambio (Período, Días
  solicitados, Fecha desde/hasta, Fecha de regreso, Días pendientes,
  Observaciones opcional).
- **Los otros 6 tipos** (`personal`, `familiar`, `medico`, `perdida`,
  `tramites`, `otro`): formulario simple nuevo —
  - Fecha desde / Fecha hasta (mismos inputs de fecha que ya existen,
    reutilizando `dateFrom`/`dateTo`; para un permiso de un solo día el
    usuario pone la misma fecha en ambos).
  - Motivo (textarea, obligatorio — reutiliza el campo `notes`, con el
    label cambiado a "Motivo" para estos tipos).
  - Adjuntar documento (`<input type="file">`, opcional, cualquier tipo de
    archivo — igual de laxo que `addAdjunto` en Proyectos, que tampoco
    restringe tipo de archivo).
  - Período, Días solicitados, Fecha de regreso y Días pendientes no se
    muestran para estos tipos.

Validación en el cliente antes de enviar:
- `vacaciones`: la validación actual sin cambios (días > 0, fechas
  coherentes, fecha de regreso presente).
- Los otros 6 tipos: fecha desde y hasta obligatorias (hasta ≥ desde),
  motivo no vacío. El archivo es opcional.

### 3. Acción de envío (`actions.ts`, `createVacationRequest`)

- `CreateVacationRequestInput.tipo` amplía su unión a los 7 valores.
- Se agrega un campo opcional `attachment?: File | null`.
- La validación server-side espeja la del cliente: los campos específicos
  de vacaciones solo se exigen cuando `tipo === "vacaciones"`; para los
  otros 6, se exige `notes` no vacío.
- Si viene `attachment`, se sube al bucket `vacation-request-attachments`
  con una ruta `${requestId-o-un-uuid-temporal}/${file.name}` (mismo
  patrón de subida que `uploadDecisionSignature`, sin necesidad de
  reinventar la lógica de subida) y se guarda la ruta en
  `attachment_path`. Si falla la subida, la solicitud completa falla con
  un error claro (a diferencia del envío de correo, que sí puede fallar
  silenciosamente — aquí el adjunto es parte de lo que el usuario pidió
  explícitamente guardar).
- Para `days_requested`/`return_date`/`days_pending` ausentes (tipos no
  vacaciones), se insertan como `null`.

### 4. Lista de solicitudes (`page.tsx`)

- Título de la página: "Solicitudes de permisos" (antes "Solicitudes de
  vacaciones").
- Nueva columna "Tipo" en la tabla, con una etiqueta legible por tipo
  (Vacaciones, Personal, Familiar, Médico, Pérdida, Trámites, Otro).
- Si la fila tiene `attachment_path`, se muestra un enlace/ícono para abrir
  el documento (URL firmada de Storage, mismo patrón que ya usa el código
  existente para las firmas con `createSignedUrl`).

### 5. Panel de aprobación (`VacationRequestActions.tsx`)

- Recibe el `tipo` de la solicitud como prop nueva.
- Los 3 campos de clasificación de RRHH (Período que responde, Tiene
  vacaciones vigente, Es adelanto) solo se renderizan cuando
  `tipo === "vacaciones"` — no aplican a un permiso médico o familiar.
- El resto del flujo (firma, comentario, aprobar/rechazar) no cambia para
  ningún tipo.

### 6. Menú (`Sidebar.tsx`)

- La etiqueta cambia de "Vacaciones" a "Permisos".
- El `href` sigue siendo `/solicitudes/vacaciones` y la prop/permiso
  `canViewSolicitudesVacaciones` no cambia de nombre.
- El ícono cambia de `Palmtree` (específico de vacaciones) a `FileText`
  (genérico, ya usado en otras partes de la app para documentos).

### 7. Efecto en el Ponchador

**Vista general.** Hoy, en `page.tsx` (rama `overview`), el código
bucketiza cualquier permiso aprobado así:

```ts
if (l.tipo === "permiso") {
  entry.permiso.push(range);
} else {
  entry.vacaciones.push(range);
}
```

Con los 7 tipos nuevos esto queda invertido — solo `vacaciones` debe caer
en el balde de vacaciones, todo lo demás (los 6 tipos de permiso) cae en
el balde de permiso:

```ts
if (l.tipo === "vacaciones") {
  entry.vacaciones.push(range);
} else {
  entry.permiso.push(range);
}
```

Esta vista ya pinta la celda del día en azul (vacaciones) o naranja
(permiso) sin revelar cuál de los 6 tipos específicos fue — solo hay que
corregir qué tipo cae en qué balde, nada más cambia aquí.

**Detalle individual (corrección añadida al spec tras revisar el código
real — este hueco no estaba cubierto en la primera versión de este
documento).** A diferencia de la Vista general, el detalle individual de
una persona **nunca ha distinguido** vacaciones de permiso: la función
`get_ponchador_approved_leave(p_contact_id, p_period_start, p_period_end)`
(la que alimenta esta vista) ni siquiera devuelve la columna `tipo` —
cualquier solicitud aprobada, sea vacaciones o cualquier tipo de permiso,
siempre se renderiza como el único estado `"permiso"` existente
("Permiso aprobado"). No existe hoy un estado `"vacaciones"` en
`DayEstado`.

Para que el detalle individual muestre "Vacaciones" cuando corresponda (sin
tampoco revelar cuál de los 6 tipos de permiso específicos fue, igual que
la Vista general):

- `get_ponchador_approved_leave` se modifica para devolver también `tipo`
  (mismo cambio que ya se le hizo a `get_ponchador_team_approved_leave` /
  `get_ponchador_all_approved_leave` en la migración `20260815100000` —
  hay que recrear la función porque cambia su `returns table`).
- Se agrega `"vacaciones"` como nuevo valor de `DayEstado`
  (`src/lib/attendance.ts`), con su propio label/badge ("Vacaciones",
  color distinto de "Permiso").
- `buildAttendancePeriodRows` deja de recibir un único arreglo
  `approvedLeave`; en su lugar recibe `vacacionesLeave` y `permisoLeave`
  por separado (mismo patrón que `buildAttendanceGridDays` ya usa para la
  Vista general), y emite `estado: "vacaciones"` u `estado: "permiso"`
  según en cuál de los dos arreglos cae la fecha.
- `page.tsx` (rama individual) separa `leaveRows` en dos arreglos antes de
  llamar a `buildAttendancePeriodRows`, igual que ya hace la rama
  `overview` con `leaveByContact`.

## Fuera de alcance (Fase 2)

- Cálculo automático de días de vacaciones disponibles según
  `contacts.hire_date`.
- Vista de gestión de balances de vacaciones para el perfil que administra
  permisos (RRHH).

## Pruebas

No hay suite de pruebas automatizada para este módulo salvo
`src/app/(app)/solicitudes/vacaciones/actions.test.ts` (ya existente, cubre
`createVacationRequest`/`respondAsSupervisor`/`respondAsRrhh`). Se extiende
con casos para los 6 tipos nuevos (validación de motivo obligatorio, campos
de vacaciones ausentes). Verificación manual adicional:

- Crear una solicitud de cada uno de los 7 tipos y confirmar que el
  formulario pide los campos correctos para cada uno.
- Adjuntar un documento y confirmar que aparece el enlace en la lista.
- Aprobar una solicitud no-vacaciones como RRHH y confirmar que no
  aparecen los 3 campos de clasificación de vacaciones.
- Confirmar en el Ponchador (Vista general) que una solicitud de tipo
  `medico` aprobada se ve como "permiso" (naranja), y una de tipo
  `vacaciones` se ve como "vacaciones" (azul).
- Confirmar en el detalle individual de una persona que una solicitud de
  tipo `medico` aprobada aparece como estado "Permiso" en su tabla de
  días, y una de tipo `vacaciones` aparece como un estado "Vacaciones"
  distinto — sin que ningún texto revele cuál de los 6 tipos de permiso
  específicos fue.
