# Ponchador "Vista general" Tab — Design

## Context

`/ponchador` (shipped and deployed to production) currently has three tabs: **Mi Ponchador** (self), **Mi Equipo** (leaders — full downward `reports_to_id` chain, any depth), and **Todos** (gated by `can_manage` on the `ponchador` module). "Mi Equipo" and "Todos" both work identically today: a person-selector dropdown lets the viewer pick one person at a time, then the full single-person `PonchadorDashboard` renders for that one person.

This feature adds a fourth tab, **Vista general**, that shows a roster table — one row per person, with their key stats for the period — instead of requiring the viewer to pick one person at a time. This is purely additive: "Mi Equipo" and "Todos" keep working exactly as they do today.

## Access Model

Identical to the existing tabs — no new permission concept:

- The tab appears if the viewer has a team (`list_my_ponchador_team()` returns at least one person) or has `can_manage` on `ponchador` (or both).
- If the viewer has **only** a team: the tab shows their team's roster, no toggle.
- If the viewer has **only** `can_manage`: the tab shows the company-wide roster, with a department filter.
- If the viewer has **both**: an internal toggle ("Mi equipo" / "Toda la empresa") switches between the two rosters within this one tab. The department filter is shown and applies **only** in "Toda la empresa" mode — a leader's own team roster is never filtered by department.

## Data Layer

Computing each row's stats reuses the exact same pipeline every individual Ponchador view already uses (`buildAttendancePeriodRows` → `summarizeAttendancePeriod`, unchanged in `src/lib/attendance.ts`) — the only new work is fetching the *inputs* to that pipeline for a whole group of people at once, instead of one person at a time, to avoid an N-person roster costing N round trips.

**New SQL functions** (`security definer`, following the same pattern as the existing 6 Ponchador functions):

- `get_ponchador_team_punches(p_from timestamptz, p_to timestamptz) returns table(contact_id uuid, punched_at timestamptz)` — every punch, for every contact in the caller's downward `reports_to_id` chain, within the window. Internally reuses `get_ponchador_descendant_ids` — no new hierarchy logic.
- `get_ponchador_team_approved_leave(p_period_start date, p_period_end date) returns table(contact_id uuid, date_from date, date_to date)` — same idea for approved `vacation_requests`.
- `get_ponchador_all_punches(p_from timestamptz, p_to timestamptz) returns table(contact_id uuid, punched_at timestamptz)` — every punch for every active, ponchador-coded contact, gated by `can_manage` (empty otherwise, same convention as `list_all_ponchador_contacts`).
- `get_ponchador_all_approved_leave(p_period_start date, p_period_end date) returns table(contact_id uuid, date_from date, date_to date)` — company-wide equivalent.

**Small extensions to existing functions:**

- `list_my_ponchador_team()` and `list_all_ponchador_contacts()` both grow two more returned columns: `schedule_id uuid, department_id uuid` — needed to resolve each listed person's effective schedule for the Estado/summary calculation, the same fields `get_ponchador_contact_summary` already returns for a single person.

With these, `page.tsx`'s new roster path does, regardless of group size: one list call (team or all), one batch punches call, one batch leave call, one `getScheduleTemplatesContext()`/`departments` call (already used elsewhere on this page) — then loops in plain TypeScript over the already-fetched list, grouping each person's own punches/leave out of the batch results and running the unchanged `buildAttendancePeriodRows`/`summarizeAttendancePeriod`/`classifyPuntualidadLabel` pipeline per person. No N+1 database round trips.

## UI

- `PonchadorOverviewTable.tsx` (new component): one row per person — Nombre, Promedio de entrada, Días trabajados, Puntualidad %, Horas trabajadas — grouped by department (a subheading row per department) when showing "Toda la empresa"; a flat list, alphabetical by name, when showing "Mi equipo". Each row is a link that navigates to that same person's existing individual dashboard (`?view=team&contactId=...` or `?view=all&contactId=...`, whichever scope Vista general is currently showing) — no new single-person view is built; this reuses the page's existing drill-down entirely.
- A small internal team/company toggle (same segmented-button pattern as `PonchadorScopeTabs.tsx`) appears inside the Vista general tab, but only when the viewer has both a team and `can_manage` — otherwise the tab just shows whichever one the viewer has access to, with no toggle to show.
- `PonchadorDepartmentFilter.tsx` (new component): a `Select` dropdown of department names (plus an implicit "todos los departamentos" default), shown only in "Toda la empresa" mode. Like every other filter on this page, it's URL-driven (`?department=...`) rather than client-side state — selecting a department re-navigates, and the server component filters the already-fetched roster down to that department before rendering.
- The existing `PeriodFilter.tsx` (year/month) is reused unchanged and continues to apply to whichever tab is active, including Vista general.
- `PonchadorScopeTabs.tsx` grows a fourth entry, `"overview"`, shown under the same "has team or can_manage" condition as before (i.e. it appears whenever either "Mi Equipo" or "Todos" would appear).

## `page.tsx` Behavior

- A new `?view=overview` value, plus `?rosterScope=team|all` (only meaningful when both are available — defaults to team if the viewer has one, else all) and `?department=...` (only meaningful in `all` roster scope).
- When `view=overview`, the page skips the existing single-person data-fetching path entirely and instead: resolves the roster list (`list_my_ponchador_team`/`list_all_ponchador_contacts`, now including `schedule_id`/`department_id`), fetches the batch punches/leave for that same group, and computes one `AttendancePeriodSummary` per person using the unchanged pipeline — filtering the roster down to the requested `department` (when in "all" roster scope) in plain TypeScript over the already-fetched list, before running the per-person calculation, so no extra database round trip is needed per filter change.
- Existing self/team/all single-person paths (`view=self|team|all` with a `contactId`) are entirely unchanged.

## Testing

New integration tests for the four new SQL functions (same style as `ponchadorVisibility.test.ts`): a team roster batch-punches call returns punches for multiple downward-chain contacts in one call; an outsider's punches never leak into another caller's team/all batch result; the all-scoped functions return empty for a non-`can_manage` caller and populated for a `can_manage` caller; the extended `schedule_id`/`department_id` columns come back correctly on `list_my_ponchador_team`/`list_all_ponchador_contacts`.

## Out of Scope

- Sortable table columns (fixed alphabetical/department-grouped order for this iteration).
- Exporting the roster table.
- Editing anyone's data from this view.
- A department filter for "Mi equipo" (explicitly deferred — only "Toda la empresa" gets filtered).
