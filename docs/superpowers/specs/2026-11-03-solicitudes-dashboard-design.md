# Solicitudes de permisos: resumen personal y filtro de búsqueda

## Contexto

La página `/solicitudes/vacaciones` ("Solicitudes de permisos", recién ampliada
en la Fase 1 para cubrir 7 tipos de solicitud) hoy es una sola tabla plana:
trae todas las filas visibles por RLS para el usuario (las propias, las que
supervisa, o todas si tiene `can_view`/`can_authorize`) y las lista sin más
contexto. No hay manera de ver de un vistazo cuántas solicitudes propias
están en trámite, cuántos días ya se aprobaron este año, ni cuándo empieza la
próxima vacación aprobada. Tampoco hay forma de filtrar la tabla cuando tiene
muchas filas (el caso de un jefe o de RRHH).

Esta fase **no** incluye el cálculo de balance de vacaciones por antigüedad
(`contacts.hire_date`) — eso sigue siendo la Fase 2, un proyecto aparte.

## Objetivo

Convertir la página en un resumen personal con tarjetas de estado arriba de
la tabla existente, y agregar una barra de búsqueda/filtro sobre la tabla.
Sin cambios de base de datos — todos los campos necesarios ya existen en
`vacation_requests` (`tipo`, `status`, `date_from`, `date_to`,
`days_requested`, `requester_app_user_id`, `supervisor_app_user_id`).

## Diseño

### 1. Tarjetas de resumen

Se agregan arriba de la tabla, calculadas en el server component
(`page.tsx`) a partir del mismo arreglo `requests` que la página ya trae con
`select("*")` — sin consultas adicionales.

- **Mis solicitudes en trámite** — cuenta de filas donde
  `requester_app_user_id === user.id` y `status` es `pendiente_supervisor` o
  `pendiente_rrhh`. Siempre visible (puede mostrar 0).
- **Por aprobar** — cuenta de filas que esperan la firma del usuario actual:
  `status === "pendiente_supervisor" && supervisor_app_user_id === user.id`,
  más `status === "pendiente_rrhh"` si `canAuthorize` es true. Esta tarjeta
  **solo se renderiza** si el usuario tiene algún rol de aprobador — es
  decir, si `canAuthorize` es true, o si aparece como
  `supervisor_app_user_id` en al menos una fila del arreglo `requests` (sin
  importar su estado). Si no tiene ningún rol de aprobador, la tarjeta no se
  muestra (no tiene sentido mostrar "0" a alguien que nunca aprueba nada).
- **Días aprobados (año actual)** — una tarjeta con dos cifras lado a lado:
  - "Vacaciones": suma de `days_requested` de las filas propias
    (`requester_app_user_id === user.id`) con `tipo === "vacaciones"`,
    `status === "aprobado"`, y `date_from` dentro del año calendario actual.
  - "Permisos": suma de días de las filas propias con `tipo !== "vacaciones"`,
    `status === "aprobado"`, y `date_from` dentro del año actual, calculando
    cada solicitud como `díasEntre(date_from, date_to) = (date_to - date_from
    en días) + 1` (estos 6 tipos no tienen `days_requested`, que es
    exclusivo de vacaciones).
  - "Año actual" se determina con `new Date().getFullYear()` en el momento
    de renderizar (la página ya es un server component sin caché de larga
    duración).
- **Próxima vacación** — entre las filas propias con `tipo === "vacaciones"`,
  `status === "aprobado"`, y `date_from` estrictamente mayor a hoy, se toma
  la de `date_from` más próxima y se muestra como "Tus vacaciones empiezan
  el `{date_from}`". Si no hay ninguna, la tarjeta no se renderiza.

Las 4 tarjetas (o menos, según lo anterior) se muestran en una fila
responsive (`grid`, se acomoda en columnas según el ancho, apiladas en
móvil), con los mismos colores que ya usan las badges de tipo en el
Ponchador: azul para vacaciones, naranja para permisos.

### 2. Filtro de búsqueda sobre la tabla

Nuevo componente cliente `SolicitudesFilterBar.tsx` que envuelve la tabla
existente (convierte la sección de tabla de `page.tsx` en un client
component aparte, `SolicitudesTable.tsx`, que recibe `requests` y
`attachmentUrlByRequestId` ya resueltos desde el server component, más
`user.id` y `canAuthorize` para seguir decidiendo qué acciones mostrar por
fila — mismo cálculo que hoy, solo movido a un componente cliente para poder
filtrar sin re-fetch).

Controles, todos en una sola barra arriba de la tabla:

- **Buscar** (`<input type="text">`) — filtra por nombre del colaborador
  (`first_name + " " + last_name`, case-insensitive, substring).
- **Tipo** (componente `Select` de `@/components/ui/select`, el mismo que
  ya usan `ComplaintsFilterBar.tsx`/`GoservicesFilterBar.tsx`, no un
  `<select>` nativo) — "Todos" + los 7 valores de `TIPO_LABEL` ya existente
  en `page.tsx`.
- **Estado** (mismo componente `Select`) — "Todos" + los 4 valores de
  `STATUS_LABEL` ya existente.

El filtrado es 100% client-side sobre el arreglo ya cargado (no hay
paginación ni se espera un volumen de filas que lo justifique). Si el
filtro no encuentra nada, se muestra "No hay solicitudes que coincidan con
el filtro." en vez del mensaje actual de "no hay solicitudes todavía"
(ese mensaje se mantiene solo cuando el arreglo original está vacío).

### 3. Rediseño visual

- **Corrección tras revisar el código real:** no existe un componente
  `Card`/`CardContent` en `@/components/ui/` de este proyecto (solo hay
  `avatar`, `badge`, `button`, `dialog`, `input`, `label`, `select`,
  `table`). Las tarjetas de resumen se construyen con el patrón de "tarjeta
  de estadística" que esta app ya usa en el Ponchador
  (`PonchadorDashboard.tsx`): un `<div>` con clases
  `rounded-2xl border ... p-5` dentro de un contenedor
  `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4`, sin introducir un
  componente nuevo.
- La fila de tarjetas y la barra de filtro quedan dentro del mismo
  contenedor `max-w-3xl` que ya usa la página (se amplía a `max-w-4xl` para
  dar más aire a 4 tarjetas en una fila en pantallas grandes).
- Sin cambios en las columnas de la tabla ni en `VacationRequestActions.tsx`
  ni en `NewVacationRequestDialog.tsx`.

## Fuera de alcance

- Cálculo de balance de vacaciones por antigüedad (Fase 2).
- Paginación o búsqueda server-side (el volumen actual no lo requiere).
- Gráficas o visualizaciones más allá de las tarjetas numéricas.

## Pruebas

- Nueva suite `src/lib/vacationRequestSummary.test.ts` para las funciones
  puras de cálculo (días aprobados por tipo, próxima vacación, conteos de
  pendientes) extraídas a `src/lib/vacationRequestSummary.ts` — se extraen
  de `page.tsx` precisamente para poder probarlas sin renderizar la página.
- Verificación manual:
  1. Con solicitudes propias en varios estados, confirmar que "Mis
     solicitudes en trámite" cuenta solo `pendiente_supervisor` +
     `pendiente_rrhh` propias.
  2. Como jefe con una solicitud pendiente de un subordinado, confirmar que
     aparece la tarjeta "Por aprobar" con la cuenta correcta; como empleado
     sin nadie a cargo, confirmar que esa tarjeta no aparece.
  3. Con vacaciones y permisos aprobados este año, confirmar que las cifras
     de "Días aprobados" coinciden con sumar manualmente.
  4. Con una vacación aprobada futura, confirmar que "Próxima vacación"
     muestra la fecha correcta; sin ninguna, confirmar que no se muestra.
  5. Usar el filtro de Tipo, Estado y el buscador de nombre y confirmar que
     la tabla se actualiza sin recargar la página.
