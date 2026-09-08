# Quejas/Complaints Module — Design

## Context

This adds a new "Quejas" (complaints/reports) module: any logged-in platform user can submit a report — anonymously or with their own name — and exactly one designated person (extensible to more later) can review submitted reports on a small interactive dashboard. This is a brand-new feature area with no prior code to build on.

## Access Model — a new pattern for this codebase

Every existing permission in this app is granted per **role profile** (`role_profiles` → `role_profile_permissions`, one row per module, shared by everyone assigned to that profile). This feature introduces the first **per-user** access grant: a specific person can be added to a small "who can view complaints" list, independent of whatever role profile they already have. Submitting a complaint needs no permission at all — every authenticated user can do it.

- **Submitting**: open to anyone with a platform login. No module/role-profile check.
- **Viewing**: gated by a new `complaint_viewers` table (one row per person who can see complaints) rather than `role_profile_permissions`. Nothing about a viewer's existing role profile changes.
- **Managing the viewer list** (adding/removing people): reuses the *existing* `can_manage` permission on the `role_profiles` module — the same admins who can already manage role profiles can add/remove complaint viewers, so no new permission concept is needed just to control this one.

## Data Model

```sql
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null check (category in ('acoso', 'seguridad', 'etica', 'recursos_humanos', 'otro')),
  message text not null,
  is_anonymous boolean not null,
  contact_id uuid references public.contacts(id),
  check ((is_anonymous and contact_id is null) or (not is_anonymous))
);

create table public.complaint_viewers (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (app_user_id)
);
```

Categories (Acoso, Seguridad, Ética, Recursos Humanos, Otro) are a starting list — easy to extend later via a migration, same as `maintenance_records.type` or `vacation_requests.tipo` already work in this codebase.

## True Anonymity, Enforced at Submission Time

`complaints` has **no INSERT policy at all** (RLS enabled, zero insert policies — same convention already used for `time_clock_devices`/`time_clock_punches`: only a `security definer` function may write). A new function, `submit_complaint(p_category text, p_message text, p_is_anonymous boolean) returns uuid`, is the only way to create a row:

- Resolves the caller's own `contact_id` from their session (`auth.uid()` → `app_users.email` → `contacts.email`, the same resolution pattern already used in Ponchador/vacation requests) **only when `p_is_anonymous` is false**.
- When `p_is_anonymous` is true, `contact_id` is never looked up or stored — the row carries zero identifying information, not even server-side. Nobody, including a future admin with direct database access, can reconstruct who submitted an anonymous complaint. This matches the "anónima de verdad" choice made during design.
- The client never supplies `contact_id` directly — it's not a parameter of the function at all, closing off any possibility of a submitter (accidentally or deliberately) attaching someone else's identity to a report.

## Viewing Access

```sql
create or replace function public.can_view_complaints()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.complaint_viewers cv where cv.app_user_id = auth.uid()
  );
$$;
```

`complaints`' only SELECT policy is `using (public.can_view_complaints())`. `complaint_viewers` itself has select/write policies gated by `can_manage` on the `role_profiles` module (mirroring the existing `role_profile_permissions_select_platform_managers`/`_write_platform_managers` policies verbatim).

## Submission UI

A "Enviar queja" entry always visible in the sidebar (no permission check) links to a new `/quejas/nueva` page — a direct, always-visible form (not a dialog needing an extra click to open, since submitting is this page's entire purpose), styled with the same field conventions as `NewVacationRequestDialog.tsx`: a category selector (segmented buttons or a `Select`), a message textarea, and an Anónimo/Con mi nombre toggle (segmented buttons, matching the pattern already used in `PonchadorRosterScopeToggle.tsx` and this session's vacation-request Tipo toggle). Submitting calls `submit_complaint` and shows a confirmation — no further detail is ever shown back to the submitter (not even their own submission history), since there's nothing yet to reuse that data for and it keeps the anonymous path simplest.

## Review Dashboard

A `/quejas` page, visible in the sidebar only when `can_view_complaints()` is true (same wiring pattern as `canViewPonchador` in `layout.tsx`/`Sidebar.tsx`), showing:

- **Summary cards**: total de quejas, anónimas vs. con nombre, conteo por categoría — same rounded-2xl/`#04B1AF`-accent card style already used on the home page and Ponchador.
- **A category bar chart**: a small hand-built SVG bar chart (no new charting library — this codebase has none today, and one bar chart doesn't justify adding one), showing complaint count per category.
- **Filter + search**: a category filter (matching the existing `PonchadorDepartmentFilter.tsx` URL-param-driven `Select` pattern) plus a text search box filtering by message content, both reflected in the URL so filtered views are shareable/bookmarkable like every other filtered list in this app.
- **Expandable rows**: each row shows date, category, and a truncated message preview; clicking expands (in place or via a `Dialog`) to show the full message and, if not anonymous, the submitter's name.

## Perfiles de Rol — Viewer Management

A new panel added to the existing `/role-profiles` page (visible only to those who already see that page, i.e. already gated by `can_manage` on `role_profiles` — no new gate needed): a searchable list of `app_users` with an add/remove control for `complaint_viewers`. Functionally independent of the role-profile CRUD already on that page — it's placed there because that's this codebase's natural "who administers access" screen, not because it reuses any role-profile data model underneath.

## Testing

- `submit_complaint`: anonymous submission stores `contact_id = null` and no other identifying trace; named submission resolves the caller's own `contact_id` correctly; a category outside the allowed list is rejected by the check constraint.
- `can_view_complaints`/RLS: a user in `complaint_viewers` can select from `complaints`; a user not in it gets zero rows; direct `insert`/`update`/`delete` against `complaints` bypassing `submit_complaint` is rejected for everyone (no policy permits it).
- `complaint_viewers` RLS: a `can_manage`-on-role_profiles user can add/remove viewers; a user without that permission cannot.

## Out of Scope

- Status/resolution tracking (Nuevo/En proceso/Resuelto) — deferred, per the "simple list" decision.
- File/image attachments.
- Notifying the viewer(s) by email when a new complaint arrives.
- Any way for a submitter to see or follow up on their own past submissions.
- A monthly-trend chart (only the category breakdown is built for this phase).
