# Horarios — Named Schedules & Per-Department Defaults — Design

## Context

This supersedes `docs/superpowers/specs/2026-08-11-horarios-design.md`, which shipped earlier the same day (`company_schedule` singleton table + free-form per-contact override fields, merged to `main`). That spec explicitly rejected "per-day-of-week hours" and "multiple named/reusable schedule templates" in favor of a simpler "one company schedule + per-person exceptions" model.

Immediately after shipping, the real requirement turned out to be broader: Sánchez Business & Corp's default schedule is 8:00 am–5:00 pm, but conserjes (custodial staff) work 7:00 am–4:00 pm and ventas (sales) works 9:00 am–6:00 pm — three genuinely different regular schedules, not exceptions. This design went through two rounds of the same conversation: first landing on "one weekday block + a separate Saturday block" per named schedule, then widening further to full independent per-day-of-week hours (Monday through Sunday, each configurable on its own) once it became clear that's what's actually needed — not every schedule treats Saturday/Sunday the same way, and some may need any individual day to differ.

Nobody has used the just-shipped per-contact override feature yet (confirmed with the user), so this migration is a clean cutover, not a data-preserving one.

**A note on process, recorded here because it caused two real incidents during this same design conversation:** SQL blocks shown during brainstorming are illustrative sketches of the eventual migration, not ready-to-run statements — but because they look identical to real migration SQL already pasted earlier in this project, they got run against production prematurely twice (once causing `contacts.schedule_*` columns to be dropped while the trigger still referenced them, breaking the profile card and birthday widgets on the live site; once creating a `schedule_templates` table in an already-outdated shape). Both were caught and cleaned up before this final spec was written, with no data loss either time. Going forward, SQL is only meant to be run when explicitly labeled "this is the final migration, run this now."

## Summary

Schedules become named, reusable templates (e.g. "General", "Conserjes", "Ventas") instead of one company-wide row. Each template independently defines hours for any subset of the seven days of the week — a day simply absent from a schedule means that schedule doesn't work that day. Departments get an assigned default template; a contact can individually override their department's default by being assigned a different named template. Exactly one template is marked as the ultimate fallback ("General") for a department with no assignment.

## Data Model

```sql
create table public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tolerance_minutes integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one row may be the fallback default: a partial unique index over
-- rows where is_default is true means a second such row collides on the
-- same indexed value and is rejected.
create unique index schedule_templates_single_default
  on public.schedule_templates (is_default) where is_default;

create table public.schedule_template_days (
  schedule_template_id uuid not null references public.schedule_templates(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (schedule_template_id, day_of_week)
);

alter table public.schedule_templates enable row level security;
alter table public.schedule_template_days enable row level security;

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

-- schedule_template_days has no independent write path in this app - rows
-- are only ever written via the schedule_templates admin form/action using
-- the service-role client after that action's own can_manage check, exactly
-- like time_clock_devices in the attendance-agent feature. Any-authenticated
-- select is still needed so effective-schedule resolution can read it.
create policy "schedule_template_days_select_any_authenticated" on public.schedule_template_days
  for select using (auth.uid() is not null);

alter table public.departments add column default_schedule_id uuid references public.schedule_templates(id) on delete set null;

alter table public.contacts drop column schedule_start_time;
alter table public.contacts drop column schedule_end_time;
alter table public.contacts drop column schedule_workdays;
alter table public.contacts drop column schedule_tolerance_minutes;
alter table public.contacts add column schedule_id uuid references public.schedule_templates(id) on delete set null;
```

`schedule_templates`/`schedule_template_days`'s RLS reuses the existing `schedules` permission module (already registered, Super-Admin-only `can_manage`) — no new module needed. `contacts.schedule_id` stays in `enforce_contacts_update_permissions()`'s `can_edit`-gated tuple, replacing the four columns it takes the place of — same authorization tier `hire_date`/`hikvision_employee_no` already use.

`on delete set null`/`on delete cascade` mean: deleting a schedule that's assigned to a department or contact makes that department/contact fall back to whichever schedule resolves next (department default, then the global default); deleting a schedule also deletes its own day rows (nothing else references `schedule_template_days` directly). The schedule currently marked `is_default` cannot itself be deleted — enforced in the delete server action (not the database), matching this codebase's established pattern of application-level rather than database-level validation.

## Effective Schedule Logic

Resolution order, computed the same way the original `getEffectiveSchedule` was — fetch the raw rows once server-side, resolve in a pure function:

```
effective schedule = contact.schedule_id
  ?? department.default_schedule_id
  ?? the schedule_templates row where is_default = true
```

`src/lib/schedules.ts` is rewritten around this. A resolved `ScheduleTemplate` now carries `{ id, name, tolerance_minutes, days: { day_of_week: number; start_time: string; end_time: string }[] }` (`days` holds only the days actually worked — 0 to 7 entries). `formatScheduleTime` is unchanged. `formatWorkdays` is removed; in its place, `formatScheduleLine(schedule: ScheduleTemplate)` groups `days` into maximal runs of *consecutive day numbers that also share identical start/end times*, in Sunday(0)–Saturday(6) order, and joins the groups with " · ": a run of 2+ days renders as `"Lunes a viernes, 8:00 am – 5:00 pm"`, a lone day as `"Sábado, 9:00 am – 1:00 pm"`, giving e.g. `"Lunes a viernes, 8:00 am – 5:00 pm · Sábado, 9:00 am – 1:00 pm"` for a schedule with uniform weekday hours and separate Saturday hours, or a full comma-separated breakdown if every day genuinely has different hours. (Known, pre-existing limitation carried over unchanged from the original `formatWorkdays`: a schedule whose worked days wrap across the week boundary, e.g. Friday–Saturday–Sunday–Monday, won't be recognized as one contiguous range — not a regression introduced here, not worth solving for the schedules this app actually needs today.)

## Profile Display — a simplification versus today

Because the effective schedule now depends on *which contact* is being viewed (their own override, or their department's default) rather than one shared company-wide value, resolving it once per contact at the data-fetching layer is simpler than threading a shared object through every display component — which is what the original Horarios spec's implementation ended up doing (a `companySchedule` prop threaded through 7 intermediate components: `ContactsTable`, `ContactsCards`, `ContactsGrouped`, `ContactsOrgChart`/`OrgBranch`/`OrgPerson`, `BirthdaysWidget`, `BirthdaysCoverflow`, `TodayBirthdayCard`).

Instead: `ContactRow`, `MyProfileCardData`, and `BirthdayContact` each gain one new field, `schedule_line: string`, computed once per row in the page-level Server Component (`contacts/page.tsx`, `app/(app)/page.tsx`) via `getEffectiveSchedule(...)` + `formatScheduleLine(...)`, using a `schedule_templates`+`schedule_template_days` map and the relevant departments' `default_schedule_id`s, both fetched once per page load. The three leaf display components (`ContactViewDialog.tsx`, `MyProfileCard.tsx`, `BirthdayContactModal.tsx`) simply render `{contact.schedule_line}` — no schedule-related prop is threaded through any of the seven intermediate components at all.

## Admin UI

**"Horarios" page** becomes a list + create/edit form, following the same list/CRUD pattern already used by "Ponchadores" (`attendance-devices`): a table of schedule templates (name, a short summary of its hours via `formatScheduleLine`, tolerance minutes, a badge marking the default one), each row editable, plus a "Nuevo horario" action. The form has: name, tolerance minutes, a "Usar como horario por defecto" toggle (checking it on one schedule automatically un-checks it on whichever schedule currently holds that flag, enforced in the server action in the same transaction as the save), and **seven rows, Lunes through Domingo**, each with a "Trabaja este día" checkbox that reveals that day's own start/end time inputs when checked. Saving writes `schedule_templates` plus a full replace of that template's `schedule_template_days` rows (delete-all-then-insert-checked-days, in one server action — simplest correct way to sync a variable-length child collection from a form, avoiding the need to diff old vs. new day sets). Gated on the `schedules` module's `can_manage`, same as before — no new permission flags.

**Departments admin form** gains one new field: "Horario por defecto" (a dropdown of schedule templates, or "Sin asignar" / null). Edited from the existing Departments page, under that module's existing `can_edit` permission — not a new permission.

**`ContactForm`**'s four time/checkbox/tolerance-minutes fields are replaced by a single dropdown: "Horario (excepción)" — pick a named schedule, or leave as "Usar el horario de mi departamento" (`null`). The all-or-nothing client/server validation from the original spec is removed entirely — a single dropdown selection can't be half-filled.

## Migration & Data Safety

Since nobody has used the just-shipped per-contact override feature yet, and the database is currently confirmed clean (no leftover artifacts from the earlier premature-execution incidents), this migration is a straightforward clean cutover:

1. Drop `company_schedule` (table + its two RLS policies) entirely.
2. Create `schedule_templates` + `schedule_template_days` + RLS as above.
3. Seed one `schedule_templates` row from today's actual company default (`'General'`, `tolerance_minutes = 0`, `is_default = true`) plus five `schedule_template_days` rows for it (Monday–Friday, `08:00`–`17:00`; no Saturday/Sunday rows, matching "no trabaja sábados/domingos" confirmed for General).
4. Backfill **every existing department's** `default_schedule_id` to point at the new "General" row — so nothing changes for anyone on day one. An admin then explicitly reassigns the Ventas/Conserjes departments (and any others) afterward via the Departments admin form.
5. Drop the four old `contacts.schedule_*` columns; add `contacts.schedule_id` (nullable, defaults to null — meaning "use my department's default," which per step 4 resolves to "General" for everyone until reassigned).
6. Update `enforce_contacts_update_permissions()`: remove the four old columns from the `can_edit`-gated tuple, add `schedule_id` in their place.

## Testing

- Unit tests for the rewritten `getEffectiveSchedule` (contact override wins; department default wins when no contact override; global default wins when neither is set) and `formatScheduleLine` (uniform weekday range + separate Saturday, a single worked day, all seven days uniform, a fully irregular day-by-day schedule, zero worked days).
- Integration test: `schedule_templates`/`schedule_template_days` RLS — any authenticated user can SELECT; only a `can_manage` user can INSERT/UPDATE/DELETE on `schedule_templates`.
- Integration test: the `schedule_templates_single_default` partial unique index actually rejects inserting/updating a second row to `is_default = true` while one already exists.
- Integration test: deleting a schedule that's referenced by a department or a contact correctly nulls out that reference rather than erroring, and its `schedule_template_days` rows are gone too (cascade); deleting the current default schedule is blocked by the delete action.

## Out of Scope

- Schedule change history, audit trail, or notifying affected contacts when their department's default schedule changes.
- Bitácora (daily entry/exit derivation, personal history, personal monthly average) and the cross-employee comparison/ranking view — both still deferred sub-projects, unaffected by this redesign. They will consume `getEffectiveSchedule`/`ScheduleTemplate` exactly as they would have consumed the original design's simpler shape.
