# Horarios (Work Schedules) — Design

## Context

This is the first of three sub-projects needed to answer the user's actual request ("quiero ver mis históricos de llegada, mi promedio de llegada, y quién tiene mejor promedio según su horario"):

1. **This spec — Horarios.** A schedule an employee's arrival/departure can be compared against. Nothing downstream makes sense without this existing first.
2. Bitácora (deferred) — deriving daily entry/exit from raw `time_clock_punches`, plus a personal view of one's own history and monthly average arrival time.
3. Cross-employee comparison (deferred) — a supervisor/admin view ranking employees by average arrival time relative to their schedule. Deferred separately from #2 because it's permission-sensitive (seeing others' attendance) and depends on both #1 and #2 existing.

## Summary

One company-wide default schedule (a single row, same pattern as `email_settings`/`platform_settings`): a start time, an end time, which days of the week are workdays, and a grace-period tolerance in minutes. Any contact can optionally override all four values for themselves; when they don't, the company default applies. There's no concept of multiple named/reusable schedule templates — the user explicitly chose the simpler "one company schedule + per-person exceptions" model over reusable named templates.

## Data Model

```sql
create table public.company_schedule (
  id boolean primary key default true,
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  workdays smallint[] not null default '{1,2,3,4,5}',
  tolerance_minutes integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint company_schedule_singleton check (id)
);

insert into public.company_schedule (id) values (true);

alter table public.company_schedule enable row level security;
-- Unlike email_settings/time_clock_devices, this table holds no secrets -
-- any authenticated user may read it (so their own profile can show the
-- right schedule), but only a "schedules" can_manage user may write it.
create policy "company_schedule_select_any_authenticated" on public.company_schedule
  for select using (auth.uid() is not null);
create policy "company_schedule_update_managers" on public.company_schedule
  for update
  using (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false))
  with check (coalesce((select can_manage from public.get_my_module_permissions('schedules')), false));

alter table public.contacts add column schedule_start_time time;
alter table public.contacts add column schedule_end_time time;
alter table public.contacts add column schedule_workdays smallint[];
alter table public.contacts add column schedule_tolerance_minutes integer;
```

`workdays` uses Postgres/JS day-of-week numbering (0 = Sunday … 6 = Saturday), so it lines up with both `Date.getDay()` on the client and Postgres's own `extract(dow from ...)` if a future sub-project needs to query by day server-side. Default `{1,2,3,4,5}` is Monday–Friday, matching Sánchez Business & Corp's actual schedule.

The four `contacts.schedule_*` columns are all nullable and follow an all-or-nothing rule: if `schedule_start_time` is set, a person has a personal override and all four fields are expected to be filled in together (enforced in the form, not the database — see below). When null, that person uses the company default. These four columns get added to `enforce_contacts_update_permissions()`'s admin-only (`can_edit`-gated) comparison tuple, the same way `hire_date` and `hikvision_employee_no` were — editable only by someone with `can_edit` on the `contacts` module, never self-editable.

A new module row: `insert into modules (key, label) values ('schedules', 'Horarios')`, seeded into `role_profile_permissions` with `can_manage = true` for Super Admin only (same pattern as every prior module this session — `document_stamps`, `attendance_devices`).

## Effective Schedule Logic

A small pure function (`getEffectiveSchedule`, living in `src/lib/schedules.ts`) takes a contact's four override fields plus the company default row and returns whichever is actually in effect — the override if `schedule_start_time` is set, otherwise the company default. This is the one place the "override vs. default" decision is made; every other part of the app (the profile display now, the bitácora/comparison sub-projects later) calls this function rather than re-implementing the fallback logic. Alongside it, two small formatters: one for a time value ("08:00:00" → "8:00 am") and one for a workdays array ("→ Lunes a viernes" when contiguous, otherwise a comma list of day names) — both used to render the human-readable schedule line on the profile.

## Admin UI

A new page, **"Horarios"**, linked from the sidebar (same pattern as "Ponchadores"/"Actividades"), gated on `get_my_module_permissions('schedules').can_manage`. It's a single form (no create/list — there's only ever one row) editing the company default: start time, end time, a workday checkbox per day, and a tolerance-minutes number field.

On the **edit contact** page, four new fields are added to `ContactForm` under a "Horario" heading: start time, end time, workday checkboxes, tolerance minutes — all starting blank/unset (meaning "use the company default"). If any of the four is filled in, the form requires all four to be filled in before saving (client-side validation, matching this codebase's existing plain-state-and-boolean-conditions approach — no validation library is used anywhere in this repo).

## Profile Display

Every existing surface that currently shows a contact's profile details gains one new line: "Horario: Lunes a viernes, 8:00 am – 5:00 pm" — computed via `getEffectiveSchedule` + the formatters described above. Concretely, that's `ContactViewDialog.tsx` (the dialog from the contacts table), `BirthdayContactModal.tsx` (the birthday-widget dialog), and `MyProfileCard.tsx` (the home-page "Mi Perfil" card) — the same three places `formatTenure`'s "tiempo en la empresa" line already appears, since this is the same kind of derived, always-shown profile fact. It does not indicate whether this is the company default or a personal override; that distinction only matters to whoever's editing it, not to the person viewing their own or someone else's profile.

## Testing

- Unit tests for `getEffectiveSchedule` (override present → override wins; override absent → company default wins; partial override — should not normally occur given the form's all-or-nothing validation, but the function itself just checks `schedule_start_time`, so document that a partial override falls back entirely to the company default rather than mixing fields).
- Unit tests for the workday/time formatters (contiguous range, non-contiguous list, single day, all seven days).
- Integration test confirming the `schedules` module seed data (mirroring `attendanceDevicesModule.test.ts`): the module exists, only Super Admin has `can_manage`.
- Integration test confirming `company_schedule` is readable by any authenticated user but only writable by a `can_manage` user.

## Out of Scope

- Bitácora (daily entry/exit derivation, personal history view, personal monthly average) — sub-project 2.
- Cross-employee comparison/ranking — sub-project 3.
- Multiple named/reusable schedule templates — explicitly rejected in favor of the simpler company-default-plus-exceptions model.
- Per-day-of-week hours (e.g., a shorter Saturday) — explicitly rejected; one time block applies to every workday in a schedule.
- Any notion of "late" or "on time" — that's bitácora's job (sub-project 2), once actual punches can be compared against a schedule. This sub-project only stores the schedule itself.
