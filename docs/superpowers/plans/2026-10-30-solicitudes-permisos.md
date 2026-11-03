# Solicitudes de Permisos (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden the "Vacaciones" request module into "Permisos" — 7 request types (Vacaciones + 6 permiso types + "Otro"), a conditional form per type, an optional document attachment, and correct vacaciones-vs-permiso distinction everywhere the Ponchador shows approved leave (both the roster overview grid and, newly, the individual detail view, which never distinguished them before).

**Architecture:** One new migration (widen `tipo`, relax two columns to nullable, add `attachment_path`, a new Storage bucket, extend `get_ponchador_approved_leave` to return `tipo`). `src/lib/attendance.ts` gains a `"vacaciones"` `DayEstado` and splits `buildAttendancePeriodRows`'s single `approvedLeave` parameter into separate `vacacionesLeave`/`permisoLeave` arrays (mirroring the pattern `buildAttendanceGridDays` already uses). The request form/list/approval UI under `src/app/(app)/solicitudes/vacaciones/` grows a 7-way type selector with conditional fields, keeping the table/module/route names internally unchanged (only user-facing labels change) to avoid touching RLS/permissions.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Storage), Bun (`bunx tsc` / `bunx eslint` / `bunx vitest` for verification).

---

### Task 1: Migration — widen tipo, add attachment support, fix get_ponchador_approved_leave

**Files:**
- Create: `supabase/migrations/20261103100000_solicitudes_permisos_tipos.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Fase 1 de "Solicitudes de Permisos": el módulo dejó de ser exclusivo de
-- vacaciones. Amplía tipo a los 7 tipos que reconoce la empresa (ver
-- infográfico interno "Solicitud de Permisos y Vacaciones"), permite un
-- documento adjunto opcional, y le da al detalle individual del Ponchador
-- la misma distinción vacaciones/permiso que la Vista general ya tenía.

-- 1. Migra cualquier fila existente con el viejo tipo genérico 'permiso' a
--    'otro' ANTES de ampliar el constraint - 'permiso' deja de ser un valor
--    válido, así que debe hacerse en este orden o el ALTER CONSTRAINT de
--    abajo fallaría contra filas ya no conformes.
update public.vacation_requests set tipo = 'otro' where tipo = 'permiso';

-- 2. Amplía el check constraint de tipo a los 7 valores reconocidos.
alter table public.vacation_requests drop constraint vacation_requests_tipo_check;
alter table public.vacation_requests
  add constraint vacation_requests_tipo_check
  check (tipo in ('vacaciones', 'personal', 'familiar', 'medico', 'perdida', 'tramites', 'otro'));

-- 3. days_requested/return_date solo tienen sentido para tipo='vacaciones'
--    (balance de días) - los otros 6 tipos usan un formulario simple sin
--    estos campos.
alter table public.vacation_requests alter column days_requested drop not null;
alter table public.vacation_requests alter column return_date drop not null;

-- 4. Dónde guardar un documento de soporte opcional (ej. comprobante
--    médico) - una ruta de Storage, mismo patrón que las firmas de
--    aprobación (supervisor_signature_path/rrhh_signature_path).
alter table public.vacation_requests add column attachment_path text;

-- 5. attachment_path es un campo de contenido que define quien solicita,
--    con el mismo ciclo de vida que notes/tipo (se fija una vez al enviar
--    la solicitud y queda inmutable después) - debe agregarse a las dos
--    tuplas de inmutabilidad en enforce_vacation_requests_transitions, por
--    la misma razón ya documentada ahí para tipo
--    (20260815100000_vacation_requests_tipo_and_grid_leave.sql): si no se
--    agrega, un jefe directo o RRHH podría cambiar silenciosamente el
--    adjunto al mismo tiempo que registra su decisión. Mismo cuerpo que la
--    versión actual, solo se agrega attachment_path a ambas tuplas.
create or replace function public.enforce_vacation_requests_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (
      new.status is distinct from 'pendiente_supervisor'
      or new.supervisor_decision is not null
      or new.supervisor_decided_at is not null
      or new.supervisor_comments is not null
      or new.supervisor_signature_path is not null
      or new.rrhh_decision is not null
      or new.rrhh_decided_at is not null
      or new.rrhh_decided_by is not null
      or new.rrhh_comments is not null
      or new.rrhh_signature_path is not null
      or new.rrhh_period_confirmed is not null
      or new.rrhh_has_current_vacation is not null
      or new.rrhh_is_advance is not null
    ) then
      raise exception 'No se puede crear una solicitud con un estado o decisión ya definida';
    end if;

    return new;
  end if;

  -- tg_op = 'UPDATE' from here on.

  if old.status = 'pendiente_supervisor' then
    if (
      new.contact_id, new.requester_app_user_id, new.first_name, new.last_name, new.position,
      new.company_name, new.department_name, new.period, new.days_requested, new.date_from,
      new.date_to, new.return_date, new.days_pending, new.notes, new.supervisor_app_user_id,
      new.created_at, new.tipo, new.attachment_path
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.tipo, old.attachment_path
    ) then
      raise exception 'Transición de solicitud inválida en la etapa del jefe directo';
    end if;

    if (
      new.rrhh_decision, new.rrhh_decided_at, new.rrhh_decided_by, new.rrhh_comments,
      new.rrhh_signature_path, new.rrhh_period_confirmed, new.rrhh_has_current_vacation,
      new.rrhh_is_advance
    ) is distinct from (
      old.rrhh_decision, old.rrhh_decided_at, old.rrhh_decided_by, old.rrhh_comments,
      old.rrhh_signature_path, old.rrhh_period_confirmed, old.rrhh_has_current_vacation,
      old.rrhh_is_advance
    ) then
      raise exception 'Transición de solicitud inválida en la etapa del jefe directo';
    end if;

    if new.status = 'rechazado' and new.supervisor_decision = 'rechazado' then
      return new;
    elsif new.status = 'pendiente_rrhh' and new.supervisor_decision = 'aprobado' then
      return new;
    else
      raise exception 'Transición de solicitud inválida en la etapa del jefe directo';
    end if;
  end if;

  if old.status = 'pendiente_rrhh' then
    if new.rrhh_decided_by is distinct from auth.uid() then
      raise exception 'Transición de solicitud inválida en la etapa de RRHH';
    end if;

    if (
      new.contact_id, new.requester_app_user_id, new.first_name, new.last_name, new.position,
      new.company_name, new.department_name, new.period, new.days_requested, new.date_from,
      new.date_to, new.return_date, new.days_pending, new.notes, new.supervisor_app_user_id,
      new.created_at, new.supervisor_decision, new.supervisor_decided_at, new.supervisor_comments,
      new.supervisor_signature_path, new.tipo, new.attachment_path
    ) is distinct from (
      old.contact_id, old.requester_app_user_id, old.first_name, old.last_name, old.position,
      old.company_name, old.department_name, old.period, old.days_requested, old.date_from,
      old.date_to, old.return_date, old.days_pending, old.notes, old.supervisor_app_user_id,
      old.created_at, old.supervisor_decision, old.supervisor_decided_at, old.supervisor_comments,
      old.supervisor_signature_path, old.tipo, old.attachment_path
    ) then
      raise exception 'Transición de solicitud inválida en la etapa de RRHH';
    end if;

    if new.status = 'rechazado' and new.rrhh_decision = 'rechazado' then
      return new;
    elsif new.status = 'aprobado' and new.rrhh_decision = 'aprobado' then
      return new;
    else
      raise exception 'Transición de solicitud inválida en la etapa de RRHH';
    end if;
  end if;

  -- old.status in ('aprobado', 'rechazado'): no edit-after-decision flow exists.
  raise exception 'No se puede modificar una solicitud ya finalizada';
end;
$$;

-- 6. Bucket nuevo para el documento de soporte opcional, mismo patrón
--    bloqueado que vacation-request-signatures: cero políticas en
--    storage.objects deniega anon/authenticated por completo. Solo el
--    cliente admin (usado por createVacationRequest tras sus propias
--    validaciones de aplicación) puede escribirlo, y solo se lee mediante
--    URLs firmadas generadas en el servidor.
insert into storage.buckets (id, name, public)
values ('vacation-request-attachments', 'vacation-request-attachments', false)
on conflict (id) do nothing;

-- 7. get_ponchador_approved_leave (detalle individual del Ponchador) nunca
--    devolvía tipo, así que cualquier solicitud aprobada - vacaciones o
--    cualquier tipo de permiso - se mostraba siempre como el mismo estado
--    genérico "Permiso aprobado". Se le agrega tipo, mismo cambio ya hecho
--    a get_ponchador_team_approved_leave/get_ponchador_all_approved_leave
--    en 20260815100000_vacation_requests_tipo_and_grid_leave.sql. El shape
--    de retorno cambia, así que hay que hacer drop antes de recrear (misma
--    razón que esa migración).
drop function if exists public.get_ponchador_approved_leave(uuid, date, date);

create function public.get_ponchador_approved_leave(p_contact_id uuid, p_period_start date, p_period_end date)
returns table (date_from date, date_to date, tipo text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_view_ponchador_contact(p_contact_id) then
    raise exception 'not authorized to view this contact''s ponchador';
  end if;

  return query
    select vr.date_from, vr.date_to, vr.tipo
    from public.vacation_requests vr
    where vr.contact_id = p_contact_id
      and vr.status = 'aprobado'
      and vr.date_from <= p_period_end
      and vr.date_to >= p_period_start;
end;
$$;
```

- [ ] **Step 2: Present the migration to the user and wait for confirmation**

This project's standing rule: Claude never runs migration SQL directly
against Supabase. Show the user the full file content above and say:

> "Escribí la migración en `supabase/migrations/20261103100000_solicitudes_permisos_tipos.sql`. Por favor córrela en el editor SQL de Supabase y confírmame cuando esté aplicada antes de que continúe con el código de la aplicación que depende de ella."

**Do not start Task 2 or any later task until the user explicitly confirms
the migration ran successfully.** If they report an error running it, fix
the migration file and ask them to re-run it — don't work around a failed
migration by changing the application code to tolerate the old schema.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261103100000_solicitudes_permisos_tipos.sql
git commit -m "$(cat <<'EOF'
feat(solicitudes): widen vacation_requests to 7 tipos, add attachment support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `src/lib/attendance.ts` — distinguish vacaciones from permiso

**Files:**
- Modify: `src/lib/attendance.ts:229-352`

- [ ] **Step 1: Add `"vacaciones"` to `DayEstado` and `vacacionesDias` to `AttendancePeriodSummary`**

Replace:

```ts
export type DayEstado = "puntual" | "llegada_tarde" | "salida_anticipada" | "ausente" | "permiso";
```

with:

```ts
export type DayEstado = "puntual" | "llegada_tarde" | "salida_anticipada" | "ausente" | "permiso" | "vacaciones";
```

And in `AttendancePeriodSummary` (currently lines 354-366), add `vacacionesDias` right after `permisos`:

```ts
export interface AttendancePeriodSummary {
  diasHabiles: number;
  diasTrabajados: number; // puntual + llegada_tarde + salida_anticipada
  puntuales: number;
  llegadasTarde: number;
  salidasAnticipadas: number;
  ausencias: number;
  permisos: number;
  vacacionesDias: number;
  feriados: number; // always 0 - no holiday calendar exists yet
  horasTrabajadasMinutes: number;
  promedioEntradaMinutes: number | null;
  puntualidadPercent: number | null;
}
```

- [ ] **Step 2: Replace `buildAttendancePeriodRows`'s doc comment and signature**

Replace the comment block + function (currently lines 265-352, the whole
function from its leading comment through the closing `}`) with:

```ts
// Builds one row per scheduled workday between periodStartIso and
// periodEndIso (inclusive), plus a row for any day outside the schedule
// where the person punched in anyway (e.g. came in on a Saturday/Sunday
// that isn't part of their horario laboral) - those are recorded as plain
// "puntual" rows since there's no scheduled start/end time to evaluate
// tardiness against. The caller is responsible for clamping periodEndIso to
// getBusinessToday() so future days aren't evaluated for absence.
//
// vacacionesLeave and permisoLeave are kept as two separate arrays (instead
// of one list with a tipo tag) so a scheduled day falling in either one
// short-circuits before any punch/tardiness logic runs - vacaciones takes
// priority if a date somehow appears in both. For each scheduled day, in
// priority order:
//   1. Covered by a vacaciones range -> "vacaciones"
//   2. Covered by a permiso range -> "permiso"
//   3. No punch that day at all -> "ausente", observación "Sin justificación"
//   4. Arrival later than schedule start + tolerance_minutes -> "llegada_tarde"
//   5. Exit earlier than schedule end - earlyDepartureThresholdMinutes ->
//      "salida_anticipada" (only checked if the day wasn't already
//      "llegada_tarde" - arrival problems take priority over departure ones)
//   6. Otherwise -> "puntual"
export function buildAttendancePeriodRows(
  periodStartIso: string,
  periodEndIso: string,
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  vacacionesLeave: ApprovedLeaveRange[],
  permisoLeave: ApprovedLeaveRange[],
  earlyDepartureThresholdMinutes: number,
): AttendancePeriodRow[] {
  const scheduledDayOfWeeks = new Map(schedule.days.map((d) => [d.day_of_week, d]));
  const rowsByDate = new Map(arrivalsAndExits.map((r) => [r.dateIso, r]));

  const rows: AttendancePeriodRow[] = [];
  for (const dateIso of enumerateDateRange(periodStartIso, periodEndIso)) {
    const scheduledDay = scheduledDayOfWeeks.get(businessDayOfWeek(dateIso));
    const attendance = rowsByDate.get(dateIso);
    const arrivalMinutes = attendance?.arrivalMinutes ?? null;
    const exitMinutes = attendance?.exitMinutes ?? null;
    const workedMinutes = arrivalMinutes !== null && exitMinutes !== null ? exitMinutes - arrivalMinutes : null;

    if (!scheduledDay) {
      if (arrivalMinutes === null) continue;
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "puntual", observacion: "—", outsideSchedule: true });
      continue;
    }

    const onVacaciones = vacacionesLeave.some((leave) => isDateInRange(dateIso, leave.dateFrom, leave.dateTo));
    const onPermiso = permisoLeave.some((leave) => isDateInRange(dateIso, leave.dateFrom, leave.dateTo));

    if (onVacaciones) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "vacaciones", observacion: "Vacaciones aprobadas", outsideSchedule: false });
      continue;
    }

    if (onPermiso) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "permiso", observacion: "Permiso aprobado", outsideSchedule: false });
      continue;
    }

    if (arrivalMinutes === null) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "ausente", observacion: "Sin justificación", outsideSchedule: false });
      continue;
    }

    const scheduledStart = scheduleTimeToMinutes(scheduledDay.start_time);
    const scheduledEnd = scheduleTimeToMinutes(scheduledDay.end_time);
    const lateByTotal = arrivalMinutes - scheduledStart;
    if (lateByTotal > schedule.tolerance_minutes) {
      rows.push({
        dateIso,
        arrivalMinutes,
        exitMinutes,
        workedMinutes,
        estado: "llegada_tarde",
        observacion: `${lateByTotal} min tarde`,
        outsideSchedule: false,
      });
      continue;
    }

    if (exitMinutes !== null) {
      const earlyByTotal = scheduledEnd - exitMinutes;
      if (earlyByTotal > earlyDepartureThresholdMinutes) {
        rows.push({
          dateIso,
          arrivalMinutes,
          exitMinutes,
          workedMinutes,
          estado: "salida_anticipada",
          observacion: `${earlyByTotal} min antes`,
          outsideSchedule: false,
        });
        continue;
      }
    }

    rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "puntual", observacion: "—", outsideSchedule: false });
  }
  return rows;
}
```

- [ ] **Step 3: Add `vacacionesDias` to `summarizeAttendancePeriod`**

Replace the function (currently lines ~368-404ish, from its leading comment
through the closing `}` and `return { ... }`) with:

```ts
// Pure aggregation over buildAttendancePeriodRows' own output - no new data
// source, just counting/summing what's already there.
export function summarizeAttendancePeriod(rows: AttendancePeriodRow[]): AttendancePeriodSummary {
  const puntuales = rows.filter((r) => r.estado === "puntual").length;
  const llegadasTarde = rows.filter((r) => r.estado === "llegada_tarde").length;
  const salidasAnticipadas = rows.filter((r) => r.estado === "salida_anticipada").length;
  const ausencias = rows.filter((r) => r.estado === "ausente").length;
  const permisos = rows.filter((r) => r.estado === "permiso").length;
  const vacacionesDias = rows.filter((r) => r.estado === "vacaciones").length;
  const diasTrabajados = puntuales + llegadasTarde + salidasAnticipadas;
  const horasTrabajadasMinutes = rows.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0);

  const arrivalsWorked = rows
    .filter((r) => r.estado === "puntual" || r.estado === "llegada_tarde" || r.estado === "salida_anticipada")
    .map((r) => r.arrivalMinutes)
    .filter((m): m is number => m !== null);
  const promedioEntradaMinutes =
    arrivalsWorked.length === 0 ? null : arrivalsWorked.reduce((a, b) => a + b, 0) / arrivalsWorked.length;

  const puntualidadPercent = diasTrabajados === 0 ? null : Math.round((puntuales / diasTrabajados) * 100);

  return {
    diasHabiles: rows.length,
    diasTrabajados,
    puntuales,
    llegadasTarde,
    salidasAnticipadas,
    ausencias,
    permisos,
    vacacionesDias,
    feriados: 0,
    horasTrabajadasMinutes,
    promedioEntradaMinutes,
    puntualidadPercent,
  };
}
```

- [ ] **Step 4: Typecheck (expect errors in call sites — fixed in Task 3)**

Run: `bunx tsc --noEmit`
Expected: errors in `src/lib/attendance.test.ts` and
`src/app/(app)/ponchador/page.tsx` about wrong argument count / missing
`vacacionesDias` — those are fixed in Tasks 3 and 4. Confirm there are NO
errors inside `src/lib/attendance.ts` itself before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts
git commit -m "$(cat <<'EOF'
feat(attendance): distinguish vacaciones from permiso in DayEstado

buildAttendancePeriodRows previously took one merged approvedLeave
array and always emitted "permiso" - it now takes vacacionesLeave and
permisoLeave separately (mirroring buildAttendanceGridDays) and emits
a distinct "vacaciones" estado. Call sites updated in a follow-up
commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `src/lib/attendance.test.ts` — fix call sites, add vacaciones coverage

**Files:**
- Modify: `src/lib/attendance.test.ts:390-583`

- [ ] **Step 1: Update the "covered by approved leave" test to use `permisoLeave` and add a sibling "vacaciones" test**

Replace:

```ts
  it("marks a scheduled day covered by approved leave as permiso, even with no punch", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "permiso",
        observacion: "Permiso aprobado",
        outsideSchedule: false,
      },
    ]);
  });
```

with:

```ts
  it("marks a scheduled day covered by a permiso range as permiso, even with no punch", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [],
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "permiso",
        observacion: "Permiso aprobado",
        outsideSchedule: false,
      },
    ]);
  });

  it("marks a scheduled day covered by a vacaciones range as vacaciones, even with no punch", () => {
    // 2026-01-12 is a Monday
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: null,
        exitMinutes: null,
        workedMinutes: null,
        estado: "vacaciones",
        observacion: "Vacaciones aprobadas",
        outsideSchedule: false,
      },
    ]);
  });

  it("prioritizes vacaciones over permiso when a date falls in both ranges", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      [{ dateFrom: "2026-01-12", dateTo: "2026-01-12" }],
      15,
    );
    expect(result[0].estado).toBe("vacaciones");
  });
```

- [ ] **Step 2: Fix every remaining call site to the new 7-argument signature**

Each of these currently passes a single `approvedLeave` array (empty `[]`
in all of them) where the new signature needs two separate arrays
(`vacacionesLeave`, `permisoLeave`) — insert an extra `[]` in each.

Replace:

```ts
  it("marks a scheduled day with no punch and no leave as ausente", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-12", schedule, [], [], 15);
```

with:

```ts
  it("marks a scheduled day with no punch and no leave as ausente", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-12", schedule, [], [], [], 15);
```

Replace (the `llegada_tarde` test):

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 17 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60 + 20,
        exitMinutes: 17 * 60,
        workedMinutes: 17 * 60 - (8 * 60 + 20),
        estado: "llegada_tarde",
        observacion: "20 min tarde",
        outsideSchedule: false,
      },
    ]);
  });
```

with:

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 17 * 60 }],
      [],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60 + 20,
        exitMinutes: 17 * 60,
        workedMinutes: 17 * 60 - (8 * 60 + 20),
        estado: "llegada_tarde",
        observacion: "20 min tarde",
        outsideSchedule: false,
      },
    ]);
  });
```

Replace (the `salida_anticipada` test):

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 16 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 16 * 60,
        workedMinutes: 16 * 60 - 8 * 60,
        estado: "salida_anticipada",
        observacion: "60 min antes",
        outsideSchedule: false,
      },
    ]);
  });
```

with:

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 16 * 60 }],
      [],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 16 * 60,
        workedMinutes: 16 * 60 - 8 * 60,
        estado: "salida_anticipada",
        observacion: "60 min antes",
        outsideSchedule: false,
      },
    ]);
  });
```

Replace (the "prioritizes llegada_tarde over salida_anticipada" test):

```ts
  it("prioritizes llegada_tarde over salida_anticipada when both apply the same day", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 16 * 60 }],
      [],
      15,
    );
    expect(result[0].estado).toBe("llegada_tarde");
  });
```

with:

```ts
  it("prioritizes llegada_tarde over salida_anticipada when both apply the same day", () => {
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60 + 20, exitMinutes: 16 * 60 }],
      [],
      [],
      15,
    );
    expect(result[0].estado).toBe("llegada_tarde");
  });
```

Replace (the "marks a fully on-time day as puntual" test):

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 17 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 17 * 60,
        workedMinutes: 9 * 60,
        estado: "puntual",
        observacion: "—",
        outsideSchedule: false,
      },
    ]);
  });
```

with:

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-12",
      "2026-01-12",
      schedule,
      [{ dateIso: "2026-01-12", arrivalMinutes: 8 * 60, exitMinutes: 17 * 60 }],
      [],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-12",
        arrivalMinutes: 8 * 60,
        exitMinutes: 17 * 60,
        workedMinutes: 9 * 60,
        estado: "puntual",
        observacion: "—",
        outsideSchedule: false,
      },
    ]);
  });
```

Replace:

```ts
  it("excludes a day that isn't scheduled for this schedule and has no punch", () => {
    // 2026-01-11 is a Sunday - not in schedule.days
    const result = buildAttendancePeriodRows("2026-01-11", "2026-01-11", schedule, [], [], 15);
    expect(result).toEqual([]);
  });
```

with:

```ts
  it("excludes a day that isn't scheduled for this schedule and has no punch", () => {
    // 2026-01-11 is a Sunday - not in schedule.days
    const result = buildAttendancePeriodRows("2026-01-11", "2026-01-11", schedule, [], [], [], 15);
    expect(result).toEqual([]);
  });
```

Replace (the "includes an unscheduled day" test):

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-11",
      "2026-01-11",
      schedule,
      [{ dateIso: "2026-01-11", arrivalMinutes: 9 * 60, exitMinutes: 13 * 60 }],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-11",
        arrivalMinutes: 9 * 60,
        exitMinutes: 13 * 60,
        workedMinutes: 4 * 60,
        estado: "puntual",
        observacion: "—",
        outsideSchedule: true,
      },
    ]);
  });
```

with:

```ts
    const result = buildAttendancePeriodRows(
      "2026-01-11",
      "2026-01-11",
      schedule,
      [{ dateIso: "2026-01-11", arrivalMinutes: 9 * 60, exitMinutes: 13 * 60 }],
      [],
      [],
      15,
    );
    expect(result).toEqual([
      {
        dateIso: "2026-01-11",
        arrivalMinutes: 9 * 60,
        exitMinutes: 13 * 60,
        workedMinutes: 4 * 60,
        estado: "puntual",
        observacion: "—",
        outsideSchedule: true,
      },
    ]);
  });
```

Replace:

```ts
  it("enumerates only scheduled days across a range that includes a weekend", () => {
    // 2026-01-09 Fri, 01-10 Sat, 01-11 Sun, 01-12 Mon - only Fri and Mon are scheduled
    const result = buildAttendancePeriodRows("2026-01-09", "2026-01-12", schedule, [], [], 15);
    expect(result.map((r) => r.dateIso)).toEqual(["2026-01-09", "2026-01-12"]);
  });

  it("returns an empty array when periodEndIso is before periodStartIso", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-11", schedule, [], [], 15);
    expect(result).toEqual([]);
  });
```

with:

```ts
  it("enumerates only scheduled days across a range that includes a weekend", () => {
    // 2026-01-09 Fri, 01-10 Sat, 01-11 Sun, 01-12 Mon - only Fri and Mon are scheduled
    const result = buildAttendancePeriodRows("2026-01-09", "2026-01-12", schedule, [], [], [], 15);
    expect(result.map((r) => r.dateIso)).toEqual(["2026-01-09", "2026-01-12"]);
  });

  it("returns an empty array when periodEndIso is before periodStartIso", () => {
    const result = buildAttendancePeriodRows("2026-01-12", "2026-01-11", schedule, [], [], [], 15);
    expect(result).toEqual([]);
  });
```

- [ ] **Step 3: Add `vacacionesDias` to both `summarizeAttendancePeriod` tests**

Replace:

```ts
describe("summarizeAttendancePeriod", () => {
  it("counts each estado and computes derived stats for a mixed period", () => {
    const rows = [
      { dateIso: "2026-01-05", arrivalMinutes: 480, exitMinutes: 1020, workedMinutes: 540, estado: "puntual" as const, observacion: "—", outsideSchedule: false },
      { dateIso: "2026-01-06", arrivalMinutes: 500, exitMinutes: 1020, workedMinutes: 520, estado: "llegada_tarde" as const, observacion: "20 min tarde", outsideSchedule: false },
      { dateIso: "2026-01-07", arrivalMinutes: 480, exitMinutes: 960, workedMinutes: 480, estado: "salida_anticipada" as const, observacion: "60 min antes", outsideSchedule: false },
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación", outsideSchedule: false },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado", outsideSchedule: false },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result).toEqual({
      diasHabiles: 5,
      diasTrabajados: 3,
      puntuales: 1,
      llegadasTarde: 1,
      salidasAnticipadas: 1,
      ausencias: 1,
      permisos: 1,
      feriados: 0,
      horasTrabajadasMinutes: 540 + 520 + 480,
      promedioEntradaMinutes: (480 + 500 + 480) / 3,
      puntualidadPercent: Math.round((1 / 3) * 100),
    });
  });

  it("returns null-safe stats for a period with zero días trabajados", () => {
    const rows = [
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación", outsideSchedule: false },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado", outsideSchedule: false },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result.diasTrabajados).toBe(0);
    expect(result.promedioEntradaMinutes).toBeNull();
    expect(result.puntualidadPercent).toBeNull();
    expect(result.horasTrabajadasMinutes).toBe(0);
    expect(result.feriados).toBe(0);
  });
});
```

with:

```ts
describe("summarizeAttendancePeriod", () => {
  it("counts each estado and computes derived stats for a mixed period", () => {
    const rows = [
      { dateIso: "2026-01-05", arrivalMinutes: 480, exitMinutes: 1020, workedMinutes: 540, estado: "puntual" as const, observacion: "—", outsideSchedule: false },
      { dateIso: "2026-01-06", arrivalMinutes: 500, exitMinutes: 1020, workedMinutes: 520, estado: "llegada_tarde" as const, observacion: "20 min tarde", outsideSchedule: false },
      { dateIso: "2026-01-07", arrivalMinutes: 480, exitMinutes: 960, workedMinutes: 480, estado: "salida_anticipada" as const, observacion: "60 min antes", outsideSchedule: false },
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación", outsideSchedule: false },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado", outsideSchedule: false },
      { dateIso: "2026-01-10", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "vacaciones" as const, observacion: "Vacaciones aprobadas", outsideSchedule: false },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result).toEqual({
      diasHabiles: 6,
      diasTrabajados: 3,
      puntuales: 1,
      llegadasTarde: 1,
      salidasAnticipadas: 1,
      ausencias: 1,
      permisos: 1,
      vacacionesDias: 1,
      feriados: 0,
      horasTrabajadasMinutes: 540 + 520 + 480,
      promedioEntradaMinutes: (480 + 500 + 480) / 3,
      puntualidadPercent: Math.round((1 / 3) * 100),
    });
  });

  it("returns null-safe stats for a period with zero días trabajados", () => {
    const rows = [
      { dateIso: "2026-01-08", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "ausente" as const, observacion: "Sin justificación", outsideSchedule: false },
      { dateIso: "2026-01-09", arrivalMinutes: null, exitMinutes: null, workedMinutes: null, estado: "permiso" as const, observacion: "Permiso aprobado", outsideSchedule: false },
    ];
    const result = summarizeAttendancePeriod(rows);
    expect(result.diasTrabajados).toBe(0);
    expect(result.promedioEntradaMinutes).toBeNull();
    expect(result.puntualidadPercent).toBeNull();
    expect(result.horasTrabajadasMinutes).toBe(0);
    expect(result.feriados).toBe(0);
    expect(result.vacacionesDias).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run src/lib/attendance.test.ts`
Expected: all tests pass (79 existing + 3 new = 82).

- [ ] **Step 5: Typecheck and lint**

Run: `bunx tsc --noEmit && bunx eslint src/lib/attendance.ts src/lib/attendance.test.ts`
Expected: no errors in these two files (errors may remain in
`ponchador/page.tsx` until Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/lib/attendance.test.ts
git commit -m "$(cat <<'EOF'
test(attendance): cover the new vacaciones estado and update call sites

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `src/app/(app)/ponchador/page.tsx` — wire up vacaciones/permiso everywhere

**Files:**
- Modify: `src/app/(app)/ponchador/page.tsx:38-44` (ESTADO_LABELS)
- Modify: `src/app/(app)/ponchador/page.tsx:265-275` (overview roster bucketing)
- Modify: `src/app/(app)/ponchador/page.tsx:316-323` (overview per-person buildAttendancePeriodRows call)
- Modify: `src/app/(app)/ponchador/page.tsx:424-453` (single-person branch)
- Modify: `src/app/(app)/ponchador/page.tsx:485-499` (summaryDisplay)

(Line numbers are from the file as it stands before this task — re-read the
file first since Tasks 1-3 don't touch it, but confirm before editing.)

- [ ] **Step 1: Add "vacaciones" to ESTADO_LABELS**

Replace:

```ts
const ESTADO_LABELS: Record<PonchadorRow["estado"], string> = {
  puntual: "Puntual",
  llegada_tarde: "Llegada tarde",
  salida_anticipada: "Salida anticipada",
  ausente: "Ausente",
  permiso: "Permiso",
};
```

with:

```ts
const ESTADO_LABELS: Record<PonchadorRow["estado"], string> = {
  puntual: "Puntual",
  llegada_tarde: "Llegada tarde",
  salida_anticipada: "Salida anticipada",
  ausente: "Ausente",
  permiso: "Permiso",
  vacaciones: "Vacaciones",
};
```

- [ ] **Step 2: Fix the overview roster's vacaciones/permiso bucketing direction**

Replace:

```ts
    const leaveByContact = new Map<string, { vacaciones: ApprovedLeaveRange[]; permiso: ApprovedLeaveRange[] }>();
    for (const l of rosterLeaveRows ?? []) {
      const entry = leaveByContact.get(l.contact_id) ?? { vacaciones: [], permiso: [] };
      const range: ApprovedLeaveRange = { dateFrom: l.date_from, dateTo: l.date_to };
      if (l.tipo === "permiso") {
        entry.permiso.push(range);
      } else {
        entry.vacaciones.push(range);
      }
      leaveByContact.set(l.contact_id, entry);
    }
```

with:

```ts
    const leaveByContact = new Map<string, { vacaciones: ApprovedLeaveRange[]; permiso: ApprovedLeaveRange[] }>();
    for (const l of rosterLeaveRows ?? []) {
      const entry = leaveByContact.get(l.contact_id) ?? { vacaciones: [], permiso: [] };
      const range: ApprovedLeaveRange = { dateFrom: l.date_from, dateTo: l.date_to };
      if (l.tipo === "vacaciones") {
        entry.vacaciones.push(range);
      } else {
        entry.permiso.push(range);
      }
      leaveByContact.set(l.contact_id, entry);
    }
```

This single flip is correct for all 7 tipos now: only `'vacaciones'` buckets
as vacaciones, every other tipo (`personal`, `familiar`, `medico`,
`perdida`, `tramites`, `otro`) falls into the `else` branch as permiso.

- [ ] **Step 3: Update the overview's per-person `buildAttendancePeriodRows` call**

Replace:

```ts
        const personPeriodRows = buildAttendancePeriodRows(
          periodStartIso,
          periodEndIso,
          personSchedule,
          personArrivalsAndExits,
          [...personLeave.vacaciones, ...personLeave.permiso],
          EARLY_DEPARTURE_THRESHOLD_MINUTES,
        );
```

with:

```ts
        const personPeriodRows = buildAttendancePeriodRows(
          periodStartIso,
          periodEndIso,
          personSchedule,
          personArrivalsAndExits,
          personLeave.vacaciones,
          personLeave.permiso,
          EARLY_DEPARTURE_THRESHOLD_MINUTES,
        );
```

- [ ] **Step 4: Split the single-person branch's approved leave by tipo**

Replace:

```ts
  const approvedLeave: ApprovedLeaveRange[] = (leaveRows ?? []).map((r: { date_from: string; date_to: string }) => ({
    dateFrom: r.date_from,
    dateTo: r.date_to,
  }));

  const periodRows = buildAttendancePeriodRows(
    periodStartIso,
    periodEndIso,
    targetSchedule,
    arrivalsAndExits,
    approvedLeave,
    EARLY_DEPARTURE_THRESHOLD_MINUTES,
  );
```

with:

```ts
  const vacacionesLeave: ApprovedLeaveRange[] = [];
  const permisoLeave: ApprovedLeaveRange[] = [];
  for (const r of (leaveRows ?? []) as { date_from: string; date_to: string; tipo: string }[]) {
    const range: ApprovedLeaveRange = { dateFrom: r.date_from, dateTo: r.date_to };
    if (r.tipo === "vacaciones") {
      vacacionesLeave.push(range);
    } else {
      permisoLeave.push(range);
    }
  }

  const periodRows = buildAttendancePeriodRows(
    periodStartIso,
    periodEndIso,
    targetSchedule,
    arrivalsAndExits,
    vacacionesLeave,
    permisoLeave,
    EARLY_DEPARTURE_THRESHOLD_MINUTES,
  );
```

- [ ] **Step 5: Add `vacacionesDias` to `summaryDisplay`**

Replace:

```ts
  const summaryDisplay: PonchadorSummary = {
    diasHabiles: summary.diasHabiles,
    diasTrabajados: summary.diasTrabajados,
    puntuales: summary.puntuales,
    llegadasTarde: summary.llegadasTarde,
    salidasAnticipadas: summary.salidasAnticipadas,
    ausencias: summary.ausencias,
    permisos: summary.permisos,
    feriados: summary.feriados,
    horasTrabajadasLabel: formatHoursMinutes(summary.horasTrabajadasMinutes),
    promedioDiarioLabel:
      summary.diasTrabajados === 0
        ? "Sin datos"
        : formatHoursMinutes(summary.horasTrabajadasMinutes / summary.diasTrabajados),
  };
```

with:

```ts
  const summaryDisplay: PonchadorSummary = {
    diasHabiles: summary.diasHabiles,
    diasTrabajados: summary.diasTrabajados,
    puntuales: summary.puntuales,
    llegadasTarde: summary.llegadasTarde,
    salidasAnticipadas: summary.salidasAnticipadas,
    ausencias: summary.ausencias,
    permisos: summary.permisos,
    vacacionesDias: summary.vacacionesDias,
    feriados: summary.feriados,
    horasTrabajadasLabel: formatHoursMinutes(summary.horasTrabajadasMinutes),
    promedioDiarioLabel:
      summary.diasTrabajados === 0
        ? "Sin datos"
        : formatHoursMinutes(summary.horasTrabajadasMinutes / summary.diasTrabajados),
  };
```

- [ ] **Step 6: Typecheck (expect one remaining error — fixed in Task 5)**

Run: `bunx tsc --noEmit`
Expected: the only remaining error should be in
`src/app/(app)/ponchador/PonchadorDashboard.tsx` (`vacacionesDias` missing
from `PonchadorSummary`'s `Pick` list) — fixed in Task 5.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/ponchador/page.tsx"
git commit -m "$(cat <<'EOF'
fix(ponchador): correct vacaciones/permiso bucketing for the 7 new tipos

The overview roster bucketed everything except the old literal tipo
'permiso' as vacaciones - now only tipo='vacaciones' is vacaciones,
everything else is permiso. The individual detail view gains the
same distinction for the first time (get_ponchador_approved_leave now
returns tipo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `src/app/(app)/ponchador/PonchadorDashboard.tsx` — vacaciones badge + summary line

**Files:**
- Modify: `src/app/(app)/ponchador/PonchadorDashboard.tsx:26-47` (types + badge colors)
- Modify: `src/app/(app)/ponchador/PonchadorDashboard.tsx:193-200` (summary card)

- [ ] **Step 1: Add `vacacionesDias` to the `PonchadorSummary` Pick list, and recolor the badges**

Replace:

```ts
export type PonchadorSummary = Pick<
  AttendancePeriodSummary,
  | "diasHabiles"
  | "diasTrabajados"
  | "puntuales"
  | "llegadasTarde"
  | "salidasAnticipadas"
  | "ausencias"
  | "permisos"
  | "feriados"
> & {
  horasTrabajadasLabel: string;
  promedioDiarioLabel: string;
};

const ESTADO_BADGE_CLASSNAMES: Record<PonchadorRow["estado"], string> = {
  puntual: "bg-emerald-100 text-emerald-700",
  llegada_tarde: "bg-amber-100 text-amber-700",
  salida_anticipada: "bg-orange-100 text-orange-700",
  ausente: "bg-red-100 text-red-700",
  permiso: "bg-blue-100 text-blue-700",
};
```

with:

```ts
export type PonchadorSummary = Pick<
  AttendancePeriodSummary,
  | "diasHabiles"
  | "diasTrabajados"
  | "puntuales"
  | "llegadasTarde"
  | "salidasAnticipadas"
  | "ausencias"
  | "permisos"
  | "vacacionesDias"
  | "feriados"
> & {
  horasTrabajadasLabel: string;
  promedioDiarioLabel: string;
};

// Blue = vacaciones, orange = permiso - matches the color convention the
// Vista general grid (PonchadorOverviewTable's CELL_STATUS_CLASSNAMES)
// already uses, now that this table also distinguishes the two.
const ESTADO_BADGE_CLASSNAMES: Record<PonchadorRow["estado"], string> = {
  puntual: "bg-emerald-100 text-emerald-700",
  llegada_tarde: "bg-amber-100 text-amber-700",
  salida_anticipada: "bg-orange-100 text-orange-700",
  ausente: "bg-red-100 text-red-700",
  permiso: "bg-orange-100 text-orange-700",
  vacaciones: "bg-blue-100 text-blue-700",
};
```

- [ ] **Step 2: Add a "Vacaciones" line to the summary card**

Replace:

```tsx
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Permisos</dt>
                <dd className="font-medium">{summary.permisos}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Feriados</dt>
                <dd className="font-medium">{summary.feriados}</dd>
              </div>
```

with:

```tsx
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Permisos</dt>
                <dd className="font-medium">{summary.permisos}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Vacaciones</dt>
                <dd className="font-medium">{summary.vacacionesDias}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Feriados</dt>
                <dd className="font-medium">{summary.feriados}</dd>
              </div>
```

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/ponchador/PonchadorDashboard.tsx" "src/app/(app)/ponchador/page.tsx"`
Expected: no errors anywhere in the project now.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorDashboard.tsx"
git commit -m "$(cat <<'EOF'
feat(ponchador): show a distinct Vacaciones badge and summary line

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `src/app/(app)/solicitudes/vacaciones/actions.ts` — 7 tipos + attachment upload

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.ts:1-87`

- [ ] **Step 1: Add the `sanitizeFileName` import and widen the input type**

Replace:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import {
  sendVacationRequestSubmittedEmail,
  sendVacationRequestSupervisorDecisionEmail,
  sendVacationRequestRrhhDecisionEmail,
} from "@/lib/sendVacationRequestEmail";
import { getSiteUrl } from "@/lib/siteUrl";

interface ActionResult {
  error?: string;
}

export interface CreateVacationRequestInput {
  tipo: "vacaciones" | "permiso";
  period: string;
  daysRequested: number;
  dateFrom: string;
  dateTo: string;
  returnDate: string;
  daysPending: number | null;
  notes: string;
}

export async function createVacationRequest(input: CreateVacationRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };

  if (input.daysRequested <= 0) return { error: "La cantidad de días debe ser mayor a cero" };
  if (input.dateTo < input.dateFrom) return { error: "La fecha de fin debe ser posterior o igual a la fecha de inicio" };
  if (input.returnDate < input.dateTo) return { error: "La fecha de regreso debe ser posterior o igual a la fecha de fin" };

  const admin = createAdminClient();
  const resolved = await resolveVacationSupervisor(admin, user.email);
  if (!resolved.ok) return { error: resolved.error };

  const { error } = await supabase
    .from("vacation_requests")
    .insert({
      contact_id: resolved.data.contactId,
      tipo: input.tipo,
      requester_app_user_id: user.id,
      first_name: resolved.data.firstName,
      last_name: resolved.data.lastName,
      position: resolved.data.position,
      company_name: resolved.data.companyName,
      department_name: resolved.data.departmentName,
      period: input.period || null,
      days_requested: input.daysRequested,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      return_date: input.returnDate,
      days_pending: input.daysPending,
      notes: input.notes || null,
      status: "pendiente_supervisor",
      supervisor_app_user_id: resolved.data.supervisorAppUserId,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const { data: supervisor } = await admin.from("app_users").select("email").eq("id", resolved.data.supervisorAppUserId).maybeSingle();
  if (supervisor?.email) {
    const siteUrl = await getSiteUrl();
    try {
      await sendVacationRequestSubmittedEmail({
        supervisorEmail: supervisor.email,
        employeeName: `${resolved.data.firstName} ${resolved.data.lastName}`,
        requestUrl: `${siteUrl}/solicitudes/vacaciones`,
      });
    } catch (err) {
      // The request row is already committed — a mail outage must not
      // block submission. The supervisor can still be notified manually.
      console.error("Failed to send vacation request submitted email:", err);
    }
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}
```

with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVacationSupervisor } from "@/lib/resolveVacationSupervisor";
import { sanitizeFileName } from "@/lib/storagePath";
import {
  sendVacationRequestSubmittedEmail,
  sendVacationRequestSupervisorDecisionEmail,
  sendVacationRequestRrhhDecisionEmail,
} from "@/lib/sendVacationRequestEmail";
import { getSiteUrl } from "@/lib/siteUrl";

interface ActionResult {
  error?: string;
}

// The 7 request types the company recognizes (infographic "Solicitud de
// Permisos y Vacaciones"). Only "vacaciones" uses the full vacation-balance
// form (período/días solicitados/días pendientes/fecha de regreso) - the
// other 6 use a simple date-range + motivo form.
export type SolicitudTipo = "vacaciones" | "personal" | "familiar" | "medico" | "perdida" | "tramites" | "otro";

export interface CreateVacationRequestInput {
  tipo: SolicitudTipo;
  period: string;
  daysRequested: number | null;
  dateFrom: string;
  dateTo: string;
  returnDate: string | null;
  daysPending: number | null;
  notes: string;
  attachment?: File | null;
}

async function uploadRequestAttachment(
  admin: ReturnType<typeof createAdminClient>,
  file: File,
): Promise<{ path?: string; error?: string }> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return { error: "Archivo inválido" };

  // Globally-unique path (not keyed by request id, which doesn't exist yet
  // at upload time) - same pattern ContactForm's photo upload already uses.
  const path = `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error } = await admin.storage.from("vacation-request-attachments").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) return { error: error.message };
  return { path };
}

export async function createVacationRequest(input: CreateVacationRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };

  if (input.dateTo < input.dateFrom) return { error: "La fecha de fin debe ser posterior o igual a la fecha de inicio" };

  if (input.tipo === "vacaciones") {
    if (!input.daysRequested || input.daysRequested <= 0) return { error: "La cantidad de días debe ser mayor a cero" };
    if (!input.returnDate) return { error: "La fecha de regreso debe ser posterior o igual a la fecha de fin" };
    if (input.returnDate < input.dateTo) return { error: "La fecha de regreso debe ser posterior o igual a la fecha de fin" };
  } else if (!input.notes.trim()) {
    return { error: "El motivo es obligatorio para este tipo de solicitud" };
  }

  const admin = createAdminClient();
  const resolved = await resolveVacationSupervisor(admin, user.email);
  if (!resolved.ok) return { error: resolved.error };

  let attachmentPath: string | null = null;
  if (input.attachment && input.attachment.size > 0) {
    const uploaded = await uploadRequestAttachment(admin, input.attachment);
    if (uploaded.error) return { error: uploaded.error };
    attachmentPath = uploaded.path ?? null;
  }

  const { error } = await supabase
    .from("vacation_requests")
    .insert({
      contact_id: resolved.data.contactId,
      tipo: input.tipo,
      requester_app_user_id: user.id,
      first_name: resolved.data.firstName,
      last_name: resolved.data.lastName,
      position: resolved.data.position,
      company_name: resolved.data.companyName,
      department_name: resolved.data.departmentName,
      period: input.period || null,
      days_requested: input.daysRequested,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      return_date: input.returnDate,
      days_pending: input.daysPending,
      notes: input.notes || null,
      attachment_path: attachmentPath,
      status: "pendiente_supervisor",
      supervisor_app_user_id: resolved.data.supervisorAppUserId,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const { data: supervisor } = await admin.from("app_users").select("email").eq("id", resolved.data.supervisorAppUserId).maybeSingle();
  if (supervisor?.email) {
    const siteUrl = await getSiteUrl();
    try {
      await sendVacationRequestSubmittedEmail({
        supervisorEmail: supervisor.email,
        employeeName: `${resolved.data.firstName} ${resolved.data.lastName}`,
        requestUrl: `${siteUrl}/solicitudes/vacaciones`,
      });
    } catch (err) {
      // The request row is already committed — a mail outage must not
      // block submission. The supervisor can still be notified manually.
      console.error("Failed to send vacation request submitted email:", err);
    }
  }

  revalidatePath("/solicitudes/vacaciones");
  return {};
}
```

(`respondAsSupervisor`, `respondAsRrhh`, and `uploadDecisionSignature` below
this point are untouched by this task.)

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: errors only in `actions.test.ts` (fixed in Task 7),
`NewVacationRequestDialog.tsx` (Task 8), and `page.tsx`/`VacationRequestActions.tsx`
(Tasks 9-10) for the now-stricter `CreateVacationRequestInput` shape.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/actions.ts"
git commit -m "$(cat <<'EOF'
feat(solicitudes): support 7 tipos and an optional attachment on submit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `src/app/(app)/solicitudes/vacaciones/actions.test.ts` — update and extend

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.test.ts:20-29` (VALID_INPUT)
- Modify: `src/app/(app)/solicitudes/vacaciones/actions.test.ts:153-177` (the old 'permiso' test)

- [ ] **Step 1: Add `attachment: null` to `VALID_INPUT`**

Replace:

```ts
const VALID_INPUT = {
  tipo: "vacaciones" as const,
  period: "2026",
  daysRequested: 2,
  dateFrom: "2026-11-13",
  dateTo: "2026-11-14",
  returnDate: "2026-11-17",
  daysPending: 5,
  notes: "",
};
```

with:

```ts
const VALID_INPUT = {
  tipo: "vacaciones" as const,
  period: "2026",
  daysRequested: 2,
  dateFrom: "2026-11-13",
  dateTo: "2026-11-14",
  returnDate: "2026-11-17",
  daysPending: 5,
  notes: "",
  attachment: null,
};
```

- [ ] **Step 2: Replace the obsolete 'permiso' test with tests for the new tipos and motivo validation**

Replace:

```ts
  it("stores tipo = 'permiso' when explicitly requested", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({
      ok: true,
      data: {
        contactId: "contact-1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      },
    });

    const result = await createVacationRequest({ ...VALID_INPUT, tipo: "permiso" });

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "permiso",
      }),
    );
  });
```

with:

```ts
  it("stores a non-vacaciones tipo with a motivo and no vacation-balance fields", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({
      ok: true,
      data: {
        contactId: "contact-1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      },
    });

    const result = await createVacationRequest({
      tipo: "medico",
      period: "",
      daysRequested: null,
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      returnDate: null,
      daysPending: null,
      notes: "Cita con cardiólogo",
      attachment: null,
    });

    expect(result.error).toBeUndefined();
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "medico",
        days_requested: null,
        return_date: null,
        notes: "Cita con cardiólogo",
        attachment_path: null,
      }),
    );
  });

  it("rejects a non-vacaciones tipo with an empty motivo, before touching the resolver", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await createVacationRequest({
      tipo: "personal",
      period: "",
      daysRequested: null,
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      returnDate: null,
      daysPending: null,
      notes: "   ",
      attachment: null,
    });

    expect(result.error).toBe("El motivo es obligatorio para este tipo de solicitud");
    expect(resolveVacationSupervisor).not.toHaveBeenCalled();
    expect(supabase._mocks.insertMock).not.toHaveBeenCalled();
  });

  it("uploads an attachment and stores its path when one is provided", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({
      ok: true,
      data: {
        contactId: "contact-1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      },
    });
    const uploadMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
      from: mockAdmin().from,
    } as never);
    const file = new File(["contenido"], "comprobante médico.pdf", { type: "application/pdf" });

    const result = await createVacationRequest({
      tipo: "medico",
      period: "",
      daysRequested: null,
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      returnDate: null,
      daysPending: null,
      notes: "Cita médica",
      attachment: file,
    });

    expect(result.error).toBeUndefined();
    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringContaining("comprobante-medico.pdf"),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(supabase._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attachment_path: expect.stringContaining("comprobante-medico.pdf") }),
    );
  });

  it("surfaces a storage error when the attachment upload fails, without inserting the request", async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(resolveVacationSupervisor).mockResolvedValue({
      ok: true,
      data: {
        contactId: "contact-1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        supervisorAppUserId: "sup-1",
      },
    });
    const uploadMock = vi.fn().mockResolvedValue({ error: { message: "Bucket no encontrado" } });
    vi.mocked(createAdminClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ upload: uploadMock }) },
      from: mockAdmin().from,
    } as never);
    const file = new File(["contenido"], "nota.pdf", { type: "application/pdf" });

    const result = await createVacationRequest({
      tipo: "otro",
      period: "",
      daysRequested: null,
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      returnDate: null,
      daysPending: null,
      notes: "Trámite personal",
      attachment: file,
    });

    expect(result.error).toBe("Bucket no encontrado");
    expect(supabase._mocks.insertMock).not.toHaveBeenCalled();
  });
```

Note: `mockAdmin()` is already defined above in this file (used by
`beforeEach`) and returns an object with just `from` — the new tests above
call it only for its `.from` property to keep the existing
`resolveVacationSupervisor`-adjacent lookups working, while overriding
`storage` with a fresh mock per test.

- [ ] **Step 3: Run the tests**

Run: `bunx vitest run "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: all tests pass.

- [ ] **Step 4: Typecheck and lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/solicitudes/vacaciones/actions.ts" "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/actions.test.ts"
git commit -m "$(cat <<'EOF'
test(solicitudes): cover the 7 tipos, motivo validation, and attachments

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx` — 7-way form

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx` (entire file)

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createVacationRequest, type SolicitudTipo } from "./actions";

const TIPO_OPTIONS: { value: SolicitudTipo; label: string }[] = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "personal", label: "Personal" },
  { value: "familiar", label: "Familiar" },
  { value: "medico", label: "Médico" },
  { value: "perdida", label: "Pérdida" },
  { value: "tramites", label: "Trámites" },
  { value: "otro", label: "Otro" },
];

export function NewVacationRequestDialog() {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<SolicitudTipo>("vacaciones");
  const [period, setPeriod] = useState("");
  const [daysRequested, setDaysRequested] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [daysPending, setDaysPending] = useState("");
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVacaciones = tipo === "vacaciones";

  function reset() {
    setTipo("vacaciones");
    setPeriod("");
    setDaysRequested("");
    setDateFrom("");
    setDateTo("");
    setReturnDate("");
    setDaysPending("");
    setNotes("");
    setAttachment(null);
  }

  function submit() {
    if (!dateFrom || !dateTo) {
      setError("Completa la fecha desde y hasta");
      return;
    }
    if (isVacaciones && (!daysRequested || !returnDate)) {
      setError("Completa cantidad de días, fecha desde/hasta y fecha de regreso");
      return;
    }
    if (!isVacaciones && !notes.trim()) {
      setError("Completa el motivo de la solicitud");
      return;
    }
    startTransition(async () => {
      const result = await createVacationRequest({
        tipo,
        period: isVacaciones ? period : "",
        daysRequested: isVacaciones ? Number(daysRequested) : null,
        dateFrom,
        dateTo,
        returnDate: isVacaciones ? returnDate : null,
        daysPending: isVacaciones && daysPending ? Number(daysPending) : null,
        notes,
        attachment,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button>Nueva solicitud</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva solicitud de permiso</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1 rounded-lg border p-1">
              {TIPO_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    tipo === t.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {isVacaciones ? (
            <>
              <div className="space-y-1">
                <Label>Período correspondiente</Label>
                <Input placeholder="2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Cantidad de días solicitados</Label>
                <Input type="number" min="1" value={daysRequested} onChange={(e) => setDaysRequested(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Desde</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Hasta</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Fecha de regreso</Label>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Días pendientes</Label>
                <Input type="number" min="0" value={daysPending} onChange={(e) => setDaysPending(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Observaciones (opcional)</Label>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Desde</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Hasta</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Motivo</Label>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Adjuntar documento (opcional)</Label>
                <Input type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending}>
            Enviar para aprobación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx"
git commit -m "$(cat <<'EOF'
feat(solicitudes): 7-type selector with a conditional form per tipo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `src/app/(app)/solicitudes/vacaciones/page.tsx` — rename, Tipo column, attachment link

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/page.tsx` (entire file)

- [ ] **Step 1: Replace the whole file**

```tsx
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  personal: "Personal",
  familiar: "Familiar",
  medico: "Médico",
  perdida: "Pérdida",
  tramites: "Trámites",
  otro: "Otro",
};

export default async function VacationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "solicitudes_vacaciones",
  });
  const canAuthorize = flagsRows?.[0]?.can_authorize ?? false;

  const { data: requests } = await supabase
    .from("vacation_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: signatureRows } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signatures: SignatureWithUrl[] = await Promise.all(
    (signatureRows ?? []).map(async (s) => {
      const { data, error } = await supabase.storage.from("user-signatures").createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for signature ${s.id} (${s.storage_path}):`, error.message);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  // Signed URLs for any request that has an attachment_path - same pattern
  // as the signatures above, just keyed by request id instead of signature
  // id since there's at most one attachment per request.
  const attachmentUrlByRequestId = new Map<string, string>();
  await Promise.all(
    (requests ?? [])
      .filter((r) => r.attachment_path)
      .map(async (r) => {
        const { data, error } = await supabase.storage
          .from("vacation-request-attachments")
          .createSignedUrl(r.attachment_path, 14400);
        if (error) {
          console.error(`Failed to sign URL for attachment on request ${r.id}:`, error.message);
          return;
        }
        if (data?.signedUrl) attachmentUrlByRequestId.set(r.id, data.signedUrl);
      }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de permisos</h1>
        <NewVacationRequestDialog />
      </div>
      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(requests ?? []).map((r) => {
              const isPendingSupervisorForMe = r.status === "pendiente_supervisor" && r.supervisor_app_user_id === user!.id;
              // Also gated on can_authorize (via get_my_module_permissions above) so the
              // button isn't rendered at all for a can_view-only viewer — RLS and
              // respondAsRrhh's own server-side can_authorize check already make clicking
              // safe either way, but hiding it here closes the UX gap for that viewer.
              const isPendingRrhhForMe = r.status === "pendiente_rrhh" && canAuthorize;
              const attachmentUrl = attachmentUrlByRequestId.get(r.id);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.first_name} {r.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                      {attachmentUrl && (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#04B1AF] hover:underline"
                        >
                          Ver documento
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{r.period ?? "-"}</TableCell>
                  <TableCell>
                    {r.date_from} → {r.date_to}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "aprobado" ? "default" : r.status === "rechazado" ? "secondary" : "outline"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isPendingSupervisorForMe && (
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} tipo={r.tipo} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} tipo={r.tipo} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (expect one error — fixed in Task 10)**

Run: `bunx tsc --noEmit`
Expected: an error that `VacationRequestActions` doesn't accept a `tipo`
prop yet — fixed in Task 10.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/page.tsx"
git commit -m "$(cat <<'EOF'
feat(solicitudes): rename page to Solicitudes de permisos, add Tipo column

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx` — hide vacation-only fields

**Files:**
- Modify: `src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx` (entire file)

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SignatureDialog } from "@/app/(app)/(admin)/document-stamps/SignatureDialog";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import { respondAsRrhh, respondAsSupervisor } from "./actions";

interface Props {
  requestId: string;
  role: "supervisor" | "rrhh";
  signatures: SignatureWithUrl[];
  tipo: string;
}

export function VacationRequestActions({ requestId, role, signatures, tipo }: Props) {
  const [comment, setComment] = useState("");
  const [periodConfirmed, setPeriodConfirmed] = useState("");
  const [hasCurrentVacation, setHasCurrentVacation] = useState(false);
  const [isAdvance, setIsAdvance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The vacation-balance classification only makes sense for tipo =
  // "vacaciones" - a permiso médico/familiar/etc. has no "período",
  // "vacaciones vigentes", or "adelanto" concept.
  const showVacationClassification = role === "rrhh" && tipo === "vacaciones";

  function approve(signatureDataUrl: string) {
    startTransition(async () => {
      const result =
        role === "supervisor"
          ? await respondAsSupervisor(requestId, "aprobado", signatureDataUrl, comment)
          : await respondAsRrhh(requestId, "aprobado", signatureDataUrl, comment, {
              periodConfirmed,
              hasCurrentVacation,
              isAdvance,
            });
      if (result.error) setError(result.error);
    });
  }

  function reject() {
    startTransition(async () => {
      const result =
        role === "supervisor"
          ? await respondAsSupervisor(requestId, "rechazado", "", comment)
          : await respondAsRrhh(requestId, "rechazado", "", comment, {
              periodConfirmed,
              hasCurrentVacation,
              isAdvance,
            });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {showVacationClassification && (
        <div className="space-y-2 text-sm">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período al que responde</label>
            <input
              className="w-full rounded-md border p-2 text-sm"
              value={periodConfirmed}
              onChange={(e) => setPeriodConfirmed(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hasCurrentVacation} onChange={(e) => setHasCurrentVacation(e.target.checked)} />
            Tiene vacaciones vigente
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
            Tomará vacaciones por adelantada
          </label>
        </div>
      )}
      <textarea
        className="w-full rounded-md border p-2 text-sm"
        rows={2}
        placeholder="Comentario (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex gap-2">
        {/* SignatureDialog (shared with Sellos y Firmas) has no `disabled` prop on its
            trigger. Rather than modify that shared component, disable clicks on its
            trigger from the outside while a submission is in flight. */}
        <div style={isPending ? { pointerEvents: "none", opacity: 0.5 } : undefined}>
          <SignatureDialog signatures={signatures} onPick={approve} />
        </div>
        <Button type="button" variant="outline" onClick={reject} disabled={isPending}>
          Rechazar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx" "src/app/(app)/solicitudes/vacaciones/page.tsx"`
Expected: no errors anywhere in the project now.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx"
git commit -m "$(cat <<'EOF'
feat(solicitudes): hide the vacation-balance classification for non-vacaciones tipos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `src/app/(app)/Sidebar.tsx` — relabel "Vacaciones" to "Permisos"

**Files:**
- Modify: `src/app/(app)/Sidebar.tsx:5-34` (lucide-react import block)
- Modify: `src/app/(app)/Sidebar.tsx:255-259` (`solicitudesLinks`)

- [ ] **Step 1: Add the `FileText` import**

Replace:

```ts
import {
  BookUser,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock,
  FileSignature,
  Fingerprint,
```

with:

```ts
import {
  BookUser,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  Fingerprint,
```

- [ ] **Step 2: Relabel the nav entry and swap its icon**

Replace:

```ts
  const solicitudesLinks: NavLink[] = [
    ...(canViewSolicitudesVacaciones
      ? [{ href: "/solicitudes/vacaciones", label: "Vacaciones", icon: Palmtree }]
      : []),
  ];
```

with:

```ts
  const solicitudesLinks: NavLink[] = [
    ...(canViewSolicitudesVacaciones
      ? [{ href: "/solicitudes/vacaciones", label: "Permisos", icon: FileText }]
      : []),
  ];
```

Leave the `Palmtree` import and its other usage (the "Solicitudes" section
header icon, further down in this file) untouched — only this one nav
entry's icon changes.

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit && bunx eslint "src/app/(app)/Sidebar.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/Sidebar.tsx"
git commit -m "$(cat <<'EOF'
feat(sidebar): relabel Vacaciones to Permisos in the nav menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full lint of every file touched in this plan**

Run:
```bash
bunx eslint src/lib/attendance.ts src/lib/attendance.test.ts \
  "src/app/(app)/ponchador/page.tsx" "src/app/(app)/ponchador/PonchadorDashboard.tsx" \
  "src/app/(app)/solicitudes/vacaciones/actions.ts" "src/app/(app)/solicitudes/vacaciones/actions.test.ts" \
  "src/app/(app)/solicitudes/vacaciones/NewVacationRequestDialog.tsx" "src/app/(app)/solicitudes/vacaciones/page.tsx" \
  "src/app/(app)/solicitudes/vacaciones/VacationRequestActions.tsx" "src/app/(app)/Sidebar.tsx"
```
Expected: no errors.

- [ ] **Step 3: Run both test files**

Run: `bunx vitest run src/lib/attendance.test.ts "src/app/(app)/solicitudes/vacaciones/actions.test.ts"`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke test (reproduced from the spec's "Pruebas" section)**

1. Crear una solicitud de cada uno de los 7 tipos y confirmar que el
   formulario pide los campos correctos para cada uno.
2. Adjuntar un documento y confirmar que aparece el enlace "Ver documento"
   en la lista.
3. Aprobar una solicitud no-vacaciones como RRHH y confirmar que no
   aparecen los 3 campos de clasificación de vacaciones.
4. Confirmar en el Ponchador (Vista general) que una solicitud de tipo
   `medico` aprobada se ve como "permiso" (naranja), y una de tipo
   `vacaciones` se ve como "vacaciones" (azul).
5. Confirmar en el detalle individual de una persona que una solicitud de
   tipo `medico` aprobada aparece como estado "Permiso" en su tabla de
   días, y una de tipo `vacaciones` aparece como un estado "Vacaciones"
   distinto (azul) — sin que ningún texto revele cuál de los 6 tipos de
   permiso específicos fue.
6. Confirmar que el menú lateral dice "Permisos" en vez de "Vacaciones",
   y que el enlace sigue llevando a `/solicitudes/vacaciones`.

- [ ] **Step 5: Preview deploy**

Run: `bunx vercel`
Report the preview URL to the user for them to run the manual smoke test
above. **Do not run `bunx vercel --prod`** until the user explicitly
confirms they want to deploy to production.
