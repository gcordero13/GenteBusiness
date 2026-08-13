# Ponchador Team/Company Visibility — Design

## Context

`/ponchador` (shipped and deployed to production) currently shows only the logged-in user's own attendance for a selected year/month: a period filter, 4 stat cards (Promedio de entrada, Días trabajados, Puntualidad, Horas trabajadas), a Registro de asistencia table classifying each scheduled workday into an Estado (Puntual/Llegada tarde/Salida anticipada/Ausente/Permiso) + Observación, a Resumen panel, and a motivational message box.

This feature extends that page with two additional audiences, selectable via tabs:

- **Super users** (a per-role-profile permission) can view the Ponchador of **any** active employee.
- **Leaders** can view the Ponchador of everyone under them in the reporting chain — not just direct reports, but the full chain of people below them, however many levels deep.

Everyone keeps their own "Mi Ponchador" view exactly as it works today; the new tabs are purely additive.

## Access Model

Three tiers, all resolved server-side, none trusted from client input:

1. **Self** — you can always view your own Ponchador (unchanged).
2. **Team** — you can view anyone found by walking `contacts.reports_to_id` down from your own contact row, at any depth (your direct reports, their reports, and so on). This mirrors the existing hierarchy column already used to resolve a vacation request's supervisor, extended here to the full downward chain rather than just one level.
3. **All** — you can view any active contact, gated by a new permission flag: `can_manage` on the existing `ponchador` module (in `role_profile_permissions`). This flag already exists in the schema (added when the Ponchador module itself was created) but nothing uses it yet. It is assigned per role profile from the existing "Perfiles de rol" screen — not hardcoded to a role name — so it can later be granted to RRHH or any other profile without a code change.

## Database Functions

All cross-person data access goes through six small, single-purpose `security definer` SQL functions. Each independently re-derives and enforces the access model above — nothing about "who can see whom" lives in application code, matching this codebase's established pattern of putting enforceable business rules in the database (e.g. `enforce_contacts_update_permissions`, `enforce_role_profile_delete_restrictions`) so they're both unconditionally applied and directly testable via integration tests that call them as different users.

- `can_view_ponchador_contact(p_contact_id uuid) returns boolean` — the central check, reused by every function below: true if `p_contact_id` is the caller's own contact, or is found in the caller's downward `reports_to_id` chain (recursive), or the caller has `can_manage` on the `ponchador` module.
- `get_ponchador_contact_summary(p_contact_id uuid) returns table(first_name text, last_name text, schedule_id uuid, department_id uuid, hikvision_employee_no text)` — raises an exception if `can_view_ponchador_contact` is false; otherwise returns the fields needed to resolve that contact's effective schedule and render their name.
- `get_ponchador_punches(p_contact_id uuid, p_from timestamptz, p_to timestamptz) returns table(punched_at timestamptz)` — same guard; returns that contact's `time_clock_punches` in the given window.
- `get_ponchador_approved_leave(p_contact_id uuid, p_period_start date, p_period_end date) returns table(date_from date, date_to date)` — same guard; returns that contact's approved `vacation_requests` (matched by `contact_id`, not `requester_app_user_id`, since we're now looking up an arbitrary contact rather than "my own requests") whose range overlaps the period.
- `list_my_ponchador_team() returns table(id uuid, first_name text, last_name text, position text)` — the caller's full downward `reports_to_id` chain, restricted to active contacts with a non-null `hikvision_employee_no` (same filter as `list_all_ponchador_contacts` below, so the selector never offers someone who has no attendance data to show), for populating the "Mi Equipo" tab's person selector and for deciding whether to show that tab at all (empty result → no team → tab hidden).
- `list_all_ponchador_contacts() returns table(id uuid, first_name text, last_name text, position text, department_name text)` — every active contact with a non-null `hikvision_employee_no`, gated by `can_manage` on `ponchador` (returns empty if the caller lacks it); used for the "Todos" tab's person selector and to decide whether to show that tab.

The existing `time_clock_punches_select_own` RLS policy and the plain self-view queries in `page.tsx` are left untouched by this feature — see "Unified Data Path" below for why they're being replaced rather than kept as a separate code path.

## Unified Data Path

Rather than maintaining two parallel implementations of "fetch a person's Ponchador data" (the existing direct-RLS self-only queries, plus a new function-based path for team/all), `page.tsx` routes **every** view — including your own — through the same three data functions (`get_ponchador_contact_summary`, `get_ponchador_punches`, `get_ponchador_approved_leave`). Viewing yourself trivially satisfies `can_view_ponchador_contact` (you're always allowed to view your own contact), so behavior for the self case is identical to today — it just flows through the same, single, well-tested code path as the team/all cases instead of a separate one. This keeps `buildAttendancePeriodRows`/`summarizeAttendancePeriod`/`classifyPuntualidadLabel` in `src/lib/attendance.ts` completely unchanged — they operate on the same shapes regardless of whose data was fetched.

## UI: Tabs and Person Selector

- `PonchadorScopeTabs.tsx` (new client component): three tab triggers — **Mi Ponchador** (always shown), **Mi Equipo** (shown only if `list_my_ponchador_team()` returns at least one person), **Todos** (shown only if the viewer has `can_manage` on `ponchador`). Switching tabs navigates via URL (`?view=self|team|all`), following the same `useSearchParams`/`URLSearchParams`/`router.push` pattern already established by `PeriodFilter.tsx`.
- `PonchadorPersonSelector.tsx` (new client component): a searchable dropdown shown only inside the "Mi Equipo" and "Todos" tabs, listing the people returned by `list_my_ponchador_team()` or `list_all_ponchador_contacts()` respectively — "Todos" groups entries by `department_name`. Selecting a person sets `?contactId=...` in the URL.
- Everything else on the page — the period filter, the 4 stat cards, the Registro de asistencia table, the Resumen panel — is the exact same `PonchadorDashboard` component already shipped, just fed the selected person's data instead of always the viewer's own.
- The motivational message box is only rendered on the "Mi Ponchador" (self) tab. It is omitted entirely on "Mi Equipo"/"Todos" — showing a message like "¡Bien hecho, Juan!" about someone else, addressed to a supervisor rather than to Juan, would read oddly, so it's simply not shown for those views.

## `page.tsx` Behavior

- Reads `?view=self|team|all&contactId=...&year=&month=` from `searchParams`, in addition to the existing year/month handling.
- `view` defaults to `self` when absent or invalid. `contactId` defaults to the viewer's own contact id when `view=self`, or is required (with a graceful "selecciona una persona" empty state, not an error) for `team`/`all` when absent.
- Fetches `list_my_ponchador_team()` and (if `can_manage` on `ponchador`) `list_all_ponchador_contacts()` up front, to decide which tabs to render and to populate the selectors — both are cheap, active-contacts-only lookups.
- Resolves the effective viewed contact's summary via `get_ponchador_contact_summary(contactId)`. If this raises (the viewer isn't allowed to see that contact — including a tampered URL), the page falls back to the viewer's own contact rather than erroring, the same defensive posture as an invalid year/month already gets today.
- Fetches punches and approved leave for the resolved contact via `get_ponchador_punches`/`get_ponchador_approved_leave`, then runs the exact same `buildAttendancePeriodRows`/`summarizeAttendancePeriod`/`classifyPuntualidadLabel` pipeline already in `src/lib/attendance.ts` — no changes needed there.

## Testing

New integration tests (same style as `timeClockPunchesRls.test.ts`), calling the new functions as different test users:

- Viewing your own contact — allowed.
- Viewing a direct report — allowed.
- Viewing a report-of-a-report (two levels down) — allowed, proving the recursive chain works, not just one level.
- Viewing a contact outside your chain, without `can_manage` — rejected.
- Viewing any contact with `can_manage` on `ponchador` — allowed, regardless of hierarchy.
- `list_my_ponchador_team()` returns the full downward chain, not just direct reports.
- `list_all_ponchador_contacts()` returns empty for a caller without `can_manage`.

## Out of Scope

- Exporting or printing another person's Ponchador.
- Editing or correcting someone else's punches from this screen.
- Notifying an employee when their leader/a super user views their Ponchador.
- Week-view (already deferred from Phase 1).
