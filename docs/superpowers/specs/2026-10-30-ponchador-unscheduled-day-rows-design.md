# Ponchador: contar días ponchados fuera de horario (detalle individual)

## Contexto

En el detalle individual del Ponchador (`/ponchador`, vista propia o de una
persona específica), `buildAttendancePeriodRows()` (`src/lib/attendance.ts`)
solo genera una fila por cada día que esté en el `ScheduleTemplate` asignado
a la persona (`schedule.days`, por `day_of_week`). Si una persona viene a
trabajar un sábado o domingo que no está en su grupo de horario laboral, ese
ponchazo existe en la base de datos (se puede ver en `arrivalsAndExits`) pero
la fila nunca se genera: el bucle hace `if (!scheduledDay) continue;` antes
de mirar si hubo un ponchazo ese día. El resultado es que esas horas
trabajadas no aparecen en la tabla "Registro de asistencia" ni se suman a
"Horas trabajadas" / "Días trabajados" del resumen del período.

Esto **no** afecta la "Vista general" (tabla de todas las personas en
`page.tsx`, scope `overview`), que usa una función distinta
(`buildAttendanceGridDays`) y que queda fuera de este cambio.

## Objetivo

Que un día ponchado fuera del horario asignado (sábado, domingo, o cualquier
otro día que no esté en `schedule.days`) aparezca como una fila más en la
tabla de "Registro de asistencia" del detalle individual, con su hora de
entrada, salida y horas trabajadas — y que esas horas se sumen normalmente a
los totales del resumen del período (Horas trabajadas, Días trabajados).

Explícitamente **no** se introduce ningún concepto de "horas extra": ni
etiqueta, ni tarjeta de resumen separada, ni campo nuevo. El día simplemente
se trata como un día trabajado más.

## Diseño

Cambio único, contenido en `buildAttendancePeriodRows()`
(`src/lib/attendance.ts:276-341`):

- Se mueve el cálculo de `attendance`/`arrivalMinutes`/`exitMinutes`/
  `workedMinutes` antes del chequeo de `scheduledDay` (hoy ocurre después).
- Cuando `scheduledDay` es `undefined` (la fecha no está en el horario de la
  persona):
  - Si no hay ponchazo de entrada ese día (`arrivalMinutes === null`), se
    omite la fila — comportamiento idéntico al actual.
  - Si sí hay ponchazo de entrada, se agrega una fila con
    `estado: "puntual"` y `observacion: "—"`. No se evalúa tardanza ni
    salida anticipada porque no existe un horario de referencia para ese
    día — no tiene sentido comparar contra una hora de entrada/salida
    esperada que no existe.
- El resto de la función (ausencias, permiso, tardanza, salida anticipada,
  puntual — todo lo que ya corre para días sí programados) no cambia.

No se toca el tipo `DayEstado` (sigue siendo `"puntual" | "llegada_tarde" |
"salida_anticipada" | "ausente" | "permiso"`) ni ningún componente de UI
(`PonchadorDashboard.tsx`, `page.tsx`) — porque la fila nueva usa el mismo
`estado: "puntual"` y la misma forma `AttendancePeriodRow` que ya consumen,
así que fluye sin cambios por `summarizeAttendancePeriod()`, el mapeo a
`PonchadorRow` en `page.tsx`, y la tabla existente.

### Efecto en las estadísticas del resumen

Como la fila nueva entra al mismo arreglo `rows` que ya procesa
`summarizeAttendancePeriod()`:

- **Días hábiles** (`rows.length`) aumenta en 1 por cada día fuera de
  horario con ponchazo.
- **Días trabajados** y **Puntuales** aumentan en 1 (la fila cuenta como
  `"puntual"`).
- **Horas trabajadas** suma las `workedMinutes` de ese día como cualquier
  otro.
- **Puntualidad %** no se distorsiona porque puntuales y días trabajados
  suben juntos.

Este efecto es intencional y fue confirmado con el usuario: el día se trata
como un día trabajado más, sin tratamiento especial.

### Casos límite

- Ponchó entrada pero aún no ha marcado salida ese día: la fila se agrega
  igual, con `exitLabel`/`workedMinutes` en `null` (igual que ya ocurre hoy
  para días programados sin salida registrada).
- Permiso/vacaciones aprobados ese mismo día fuera de horario: no se
  consulta `approvedLeave` para estos días (al no ser un día programado, el
  permiso no tiene nada que "cubrir" — el caso es tan marginal que no amerita
  lógica adicional).
- Día fuera de horario sin ningún ponchazo: sigue sin aparecer, igual que
  hoy — este cambio solo afecta días en los que la persona efectivamente
  ponchó.

## Fuera de alcance

- La "Vista general" (`PonchadorOverviewTable` / scope `overview` en
  `page.tsx`) no cambia.
- No se introduce ningún concepto de horas extra, ni en el detalle
  individual ni en ninguna otra vista.
- No se evalúa puntualidad/tardanza para los días fuera de horario.

## Pruebas

No existe suite de pruebas automatizadas para este módulo más allá de
`bunx tsc --noEmit` / `bunx eslint`. Verificación manual sugerida: en el
detalle individual de una persona con horario de lunes a viernes, confirmar
que un ponchazo real de sábado o domingo (dato ya existente en producción,
o uno de prueba) aparece como fila en "Registro de asistencia" y se refleja
en "Horas trabajadas" / "Días trabajados" del resumen.
