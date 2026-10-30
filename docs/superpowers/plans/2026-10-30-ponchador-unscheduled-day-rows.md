# Ponchador: Contar Días Ponchados Fuera de Horario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Ponchador individual detail view, a day the person punched in on that isn't part of their assigned work schedule (e.g. a Saturday or Sunday outside their horario laboral) should show up as a normal row in "Registro de asistencia" and count toward "Horas trabajadas" / "Días trabajados" — instead of being silently skipped.

**Architecture:** Single change inside `buildAttendancePeriodRows()` in `src/lib/attendance.ts`: move the punch lookup (`arrivalMinutes`/`exitMinutes`/`workedMinutes`) above the "is this a scheduled day" check, and when the day isn't scheduled, push a plain `"puntual"` row if there was a punch (otherwise skip, same as today). No new types, no UI changes — the new row shape is identical to existing `AttendancePeriodRow` rows, so it flows through `summarizeAttendancePeriod()` and the existing table/summary UI unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript, Bun (bunx tsc / bunx eslint for verification — no automated test suite for this module).

---

### Task 1: Include unscheduled-day punches as plain "puntual" rows

**Files:**
- Modify: `src/lib/attendance.ts:264-341`

- [ ] **Step 1: Read the current function to confirm it hasn't changed**

Run: `bunx eslint src/lib/attendance.ts` (sanity check the file lints clean before editing)
Expected: no errors

- [ ] **Step 2: Replace the comment block and function body**

Replace lines 264-341 (the comment block immediately above `buildAttendancePeriodRows` through the function's closing brace) with:

```ts
// Builds one row per scheduled workday between periodStartIso and
// periodEndIso (inclusive), plus a row for any day outside the schedule
// where the person punched in anyway (e.g. came in on a Saturday/Sunday
// that isn't part of their horario laboral) - those are recorded as plain
// "puntual" rows since there's no scheduled start/end time to evaluate
// tardiness against. The caller is responsible for clamping periodEndIso to
// getBusinessToday() so future days aren't evaluated for absence. For each
// scheduled day, in priority order:
//   1. Covered by an approved leave range -> "permiso"
//   2. No punch that day at all -> "ausente", observación "Sin justificación"
//   3. Arrival later than schedule start + tolerance_minutes -> "llegada_tarde"
//   4. Exit earlier than schedule end - earlyDepartureThresholdMinutes ->
//      "salida_anticipada" (only checked if the day wasn't already
//      "llegada_tarde" - arrival problems take priority over departure ones)
//   5. Otherwise -> "puntual"
export function buildAttendancePeriodRows(
  periodStartIso: string,
  periodEndIso: string,
  schedule: ScheduleTemplate,
  arrivalsAndExits: DailyAttendanceRow[],
  approvedLeave: ApprovedLeaveRange[],
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
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "puntual", observacion: "—" });
      continue;
    }

    const onLeave = approvedLeave.some((leave) => isDateInRange(dateIso, leave.dateFrom, leave.dateTo));

    if (onLeave) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "permiso", observacion: "Permiso aprobado" });
      continue;
    }

    if (arrivalMinutes === null) {
      rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "ausente", observacion: "Sin justificación" });
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
        });
        continue;
      }
    }

    rows.push({ dateIso, arrivalMinutes, exitMinutes, workedMinutes, estado: "puntual", observacion: "—" });
  }
  return rows;
}
```

What changed vs. the current version:
- `attendance`/`arrivalMinutes`/`exitMinutes`/`workedMinutes` are now computed before the `scheduledDay` check (previously computed after, inside the scheduled-day branch only).
- The old `if (!scheduledDay) continue;` is replaced with a branch: if there's no punch that day, still `continue` (unchanged behavior); if there IS a punch (`arrivalMinutes !== null`), push a `"puntual"` row with `observacion: "—"` instead of skipping it.
- `onLeave` is now computed after the `!scheduledDay` branch (it's only used inside the scheduled-day path, so this is a harmless reordering, not a behavior change for scheduled days).
- Everything else (permiso/ausente/llegada_tarde/salida_anticipada/puntual logic for actual scheduled days) is byte-for-byte identical to today.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (the new row object has the exact same shape as `AttendancePeriodRow`, so this should be a clean pass)

- [ ] **Step 4: Lint**

Run: `bunx eslint src/lib/attendance.ts`
Expected: no errors

- [ ] **Step 5: Manual smoke test**

Since there's no automated test suite for this module, verify manually against real or seeded data:

1. Run `bun run dev` and sign in as someone with a Monday–Friday schedule (or any schedule that excludes Saturday/Sunday).
2. Go to `/ponchador` (own detail view) for a month where that person has at least one real punch recorded on a Saturday or Sunday. If no such data exists yet, this step can be deferred to checking it against production data instead of local seed data — note in the task handoff which was done.
3. Confirm:
   - A row for that Saturday/Sunday date now appears in "Registro de asistencia", with entrada/salida populated from the actual punch and estado badge "Puntual".
   - "Horas trabajadas" and "Días trabajados" in the summary cards increased to include that day's hours.
   - Days with no punch at all outside the schedule still do **not** appear as rows (no false "ausente" for unscheduled non-worked days).
   - The "Vista general" (scope=overview) table is unaffected — still the same as before this change.

- [ ] **Step 6: Commit**

```bash
git add src/lib/attendance.ts
git commit -m "$(cat <<'EOF'
fix(ponchador): count punches on unscheduled days in individual detail view

A Saturday/Sunday (or any day outside a person's assigned horario
laboral) with a real punch was being silently skipped in
buildAttendancePeriodRows, so the hours never showed up in the
detail table or the period summary. It now shows as a plain
"puntual" row - no tardiness evaluation, since there's no scheduled
start/end time to compare against.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

- [ ] `bunx tsc --noEmit` passes for the whole project
- [ ] `bunx eslint src/lib/attendance.ts` passes
- [ ] Manual smoke test from Step 5 confirmed
- [ ] Preview deploy via `bunx vercel` run and spot-checked; production deploy only after the user explicitly confirms
