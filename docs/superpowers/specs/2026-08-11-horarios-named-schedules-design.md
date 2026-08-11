# Horarios — Named Schedules & Per-Department Defaults — Design

## Context

This supersedes `docs/superpowers/specs/2026-08-11-horarios-design.md`, which shipped earlier the same day (`company_schedule` singleton table + free-form per-contact override fields, merged to `main`). That spec explicitly rejected "per-day-of-week hours" and "multiple named/reusable schedule templates" in favor of a simpler "one company schedule + per-person exceptions" model.

Immediately after shipping, the real requirement turned out to be broader: Sánchez Business & Corp's default schedule is 8:00 am–5:00 pm, but conserjes (custodial staff) work 7:00 am–4:00 pm and ventas (sales) works 9:00 am–6:00 pm — three genuinely different regular schedules, not exceptions. Additionally, Saturday hours differ from weekday hours (and this can vary per schedule, not just for the company as a whole). A single company-wide schedule plus ad-hoc per-person overrides can't represent "an entire department has different hours" without manually overriding every person in that department — which defeats the purpose of a department-level default.

Nobody has used the just-shipped per-contact override feature yet (confirmed with the user), so this migration can safely drop the old columns without preserving any real data.

## Summary

Schedules become named, reusable templates (e.g. "General", "Conserjes", "Ventas") instead of one company-wide row. Each template defines weekday (Monday–Friday) hours and, optionally, separate Saturday hours. Departments get an assigned default template; a contact can individually override their department's default by being assigned a different named template. Exactly one template is marked as the ultimate fallback ("General") for a department with no assignment.

## Data Model

```sql
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  weekday_start_time time not null,
  weekday_end_time time not null,
  works_saturday boolean not null default false,
  saturday_start_time time,
  saturday_end_time time,
  tolerance_minutes integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_templates_saturday_hours_check
    check (not works_saturday or (saturday_start_time is not null and saturday_end_time is not null))
);

-- At most one row may be the fallback default: a partial unique index over
-- rows where is_default is true means a second such row collides on the
-- same indexed value and is rejected.
create unique index schedule_templates_single_default
  on public.schedule_templates (is_default) where is_default;

alter table public.schedule_templates enable row level security;
create policy "schedule_templates_select_any_authenticated" on public.schedule_templates
  for select using (auth.uid() is not null);
create policy "schedule_templates_insert_managers" on public.schedule_templates
  for insert with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
create policy "schedule_templates_update_managers" on public.schedule_templates
  for update
  using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));
create policy "schedule_templates_delete_managers" on public.schedule_templates
  for delete using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));

alter table public.departments add column default_schedule_id uuid references public.schedule_templates(id) on delete set null;

alter table public.contacts drop column schedule_start_time;
alter table public.contacts drop column schedule_end_time;
alter table public.contacts drop column schedule_workdays;
alter table public.contacts drop column schedule_tolerance_minutes;
alter table public.contacts add column schedule_id uuid references public.schedule_templates(id) on delete set null;
```

`schedule_templates`'s RLS reuses the existing `schedules` permission module (already registered, Super-Admin-only `can_manage`) — no new module needed, since it's the same underlying concept ("who manages schedules") just applied to a different table shape. `contacts.schedule_id` stays in `enforce_contacts_update_permissions()`'s `can_edit`-gated tuple, replacing the four columns it takes the place of — same authorization tier `hire_date`/`hikvision_employee_no` already use.

`on delete set null` on both foreign keys means deleting a schedule that's currently assigned to a department or a contact doesn't error or cascade — it just makes that department/contact fall back to whichever schedule resolves next (department default, then the global default). The schedule currently marked `is_default` cannot itself be deleted — enforced in the delete server action (not the database), matching this codebase's established pattern of application-level rather than database-level validation (see the original Horarios spec's all-or-nothing rule, enforced the same way).

## Effective Schedule Logic

Resolution order, computed the same way the original `getEffectiveSchedule` was — fetch the raw rows once server-side, resolve in a pure function:

```
effective schedule = contact.schedule_id
  ?? department.default_schedule_id
  ?? the schedule_templates row where is_default = true
```

`src/lib/schedules.ts` is rewritten around this. `formatScheduleTime` is unchanged. `formatWorkdays` is removed entirely — "weekday" is now a fixed Monday–Friday concept and Saturday is its own boolean, so there's no more open-ended day-of-week array to format. `formatScheduleLine(schedule: ScheduleTemplate)` renders both blocks: `"Lunes a viernes, 8:00 am – 5:00 pm"` when `works_saturday` is false, or `"Lunes a viernes, 8:00 am – 5:00 pm · Sábado, 9:00 am – 1:00 pm"` when true.

## Profile Display — a simplification versus today

Because the effective schedule now depends on *which contact* is being viewed (their own override, or their department's default) rather than one shared company-wide value, resolving it once per contact at the data-fetching layer is simpler than threading a shared object through every display component — which is what the original Horarios spec's implementation ended up doing (a `companySchedule` prop threaded through 7 intermediate components: `ContactsTable`, `ContactsCards`, `ContactsGrouped`, `ContactsOrgChart`/`OrgBranch`/`OrgPerson`, `BirthdaysWidget`, `BirthdaysCoverflow`, `TodayBirthdayCard`).

Instead: `ContactRow`, `MyProfileCardData`, and `BirthdayContact` each gain one new field, `schedule_line: string`, computed once per row in the page-level Server Component (`contacts/page.tsx`, `app/(app)/page.tsx`) via `getEffectiveSchedule(...)` + `formatScheduleLine(...)`, using a `schedule_templates` map and the relevant departments' `default_schedule_id`s, both fetched once per page load. The three leaf display components (`ContactViewDialog.tsx`, `MyProfileCard.tsx`, `BirthdayContactModal.tsx`) simply render `{contact.schedule_line}` — no schedule-related prop is threaded through any of the seven intermediate components at all. This removes prop-threading that was just added, rather than adding more.

## Admin UI

**"Horarios" page** becomes a list + create/edit form, following the same list/CRUD pattern already used by "Ponchadores" (`attendance-devices`): a table of schedule templates (name, weekday hours, Saturday hours or "No trabaja sábados", tolerance minutes, a badge marking the default one), each row editable, plus a "Nuevo horario" action. The form has: name, weekday start/end time, a "Trabaja sábados" checkbox that reveals Saturday start/end time inputs when checked, tolerance minutes, and a "Usar como horario por defecto" toggle — checking it on one schedule automatically un-checks it on whichever schedule currently holds that flag (enforced in the server action in the same transaction as the save, since only one row may have `is_default = true`). Gated on the `schedules` module's `can_manage`, same as before — no new permission flags, matching how "Ponchadores" also gates its entire CRUD surface on a single `can_manage` flag rather than distinguishing add/edit/delete.

**Departments admin form** gains one new field: "Horario por defecto" (a dropdown of schedule templates, or "Sin asignar" / null). Edited from the existing Departments page, under that module's existing `can_edit` permission — not a new permission.

**`ContactForm`**'s four time/checkbox/tolerance-minutes fields are replaced by a single dropdown: "Horario (excepción)" — pick a named schedule, or leave as "Usar el horario de mi departamento" (`null`). The all-or-nothing client/server validation from the original spec is removed entirely — a single dropdown selection can't be half-filled, so there's nothing left to validate.

## Migration & Data Safety

Since nobody has used the just-shipped per-contact override feature yet, this migration is a clean cutover, not a data-preserving one:

1. Drop `company_schedule` (table + its two RLS policies) entirely.
2. Create `schedule_templates` + RLS as above.
3. Seed exactly one row from today's actual company default: `('General', '08:00', '17:00', works_saturday=false, tolerance_minutes=0, is_default=true)`.
4. Backfill **every existing department's** `default_schedule_id` to point at the new "General" row — so nothing changes for anyone on day one. An admin then explicitly reassigns the Ventas/Conserjes departments (and any others) afterward via the Departments admin form.
5. Drop the four old `contacts.schedule_*` columns; add `contacts.schedule_id` (nullable, defaults to null — meaning "use my department's default," which per step 4 resolves to "General" for everyone until reassigned).
6. Update `enforce_contacts_update_permissions()`: remove the four old columns from the `can_edit`-gated tuple, add `schedule_id` in their place.

## Testing

- Unit tests for the rewritten `getEffectiveSchedule` (contact override wins; department default wins when no contact override; global default wins when neither is set) and `formatScheduleLine` (with `works_saturday` true and false).
- Integration test: `schedule_templates` RLS — any authenticated user can SELECT; only a `can_manage` user can INSERT/UPDATE/DELETE.
- Integration test: the `schedule_templates_single_default` partial unique index actually rejects inserting/updating a second row to `is_default = true` while one already exists.
- Integration test: deleting a schedule that's referenced by a department or a contact correctly nulls out that reference (`on delete set null`) rather than erroring, and deleting the current default schedule is blocked by the delete action.

## Out of Scope

- Per-individual-weekday granularity beyond "one weekday block + one Saturday block" (e.g. Monday having different hours than Tuesday) — explicitly rejected during design, same as the original spec's per-day rejection, just narrowed to "weekday vs. Saturday" rather than "weekday vs. weekday."
- Sunday-specific hours — not modeled; no `sunday_start_time`/`sunday_end_time` fields. If ever needed, that's a future extension of this same shape.
- Schedule change history, audit trail, or notifying affected contacts when their department's default schedule changes.
- Bitácora (daily entry/exit derivation, personal history, personal monthly average) and the cross-employee comparison/ranking view — both still deferred sub-projects, unaffected by this redesign. They will consume `getEffectiveSchedule`/`ScheduleTemplate` exactly as they would have consumed the original design's simpler shape.
