# Home "Mi Perfil" Summary Card — Design

**Status:** Approved, implementing directly.

## Summary

Home currently opens with a plain "Bienvenido / {email}" header. This replaces that with a personalized card for the logged-in user: their photo, name, position, a divider, then who their supervisor is and how long they've been with the company. If the logged-in user has no linked `contacts` row, Home falls back to the current plain text (never renders an empty/broken card).

## Data Model

New nullable column on the existing `contacts` table:

```sql
alter table public.contacts add column hire_date date;
```

Editable only by users who already have `can_edit` on the `contacts` module — same as `birth_date`, `department_id`, etc. `ContactForm` is already gated to `can_edit`-only users at the page level ([id]/page.tsx renders `ContactForm` only when `flags?.can_edit`, `SelfEditForm` otherwise), so no new permission branching is needed inside the form itself.

`enforce_contacts_update_permissions()` (from `20260730120000_contacts_self_edit.sql`) must have `hire_date` added to its **admin-only** field-comparison tuple (the one requiring `can_edit`, alongside `first_name`, `department_id`, `photo_url`, etc.) — not the self-editable tuple (`position`, `fleet_phone`, `extension`, `has_whatsapp`). Missing this would let anyone who can update their own row at all (which self-edit permits for a few fields) silently change `hire_date` without `can_edit`.

## Components

- **`formatTenure(hireDate: string, today: Date): string`** in `src/lib/contacts.ts`, unit-tested like the birthday helpers: "X años y Y meses" (e.g. "2 años y 3 meses"), "Y meses" if under a year, "menos de 1 mes" if under 30 days.
- **`MyProfileCard`** (new, `src/app/(app)/contacts/MyProfileCard.tsx`, plain server-renderable — no client state needed): props are the contact's `name`, `position`, `photo_url`, `hire_date`, and an optional `supervisor: { name, position }`. Renders in the app's existing card style (teal border/bg, matching `EventsWidget`/`NewsWidget`): avatar (photo or initials) + name + position, a horizontal divider, then "Supervisor: {name} — {position}" (omitted if no supervisor) and "Tiempo en la empresa: {tenure}" (omitted if `hire_date` is null).

## Data Flow

`src/app/(app)/page.tsx` (already fetches the logged-in user via `supabase.auth.getUser()`) adds one query for the user's own contact row (`select id, first_name, last_name, position, photo_url, hire_date, reports_to_id ... .eq("email", user.email).maybeSingle()` — already permitted by the existing self-view RLS clause, no new policy needed) and, if `reports_to_id` is present, a second query for the supervisor's `first_name, last_name, position`. If no contact row is found, render the current plain "Bienvenido" text instead of the card.

## Testing

`formatTenure` gets unit tests covering: under a month, several months, exactly one year, multiple years plus months, and multiple whole years with zero leftover months (no "y 0 meses").

## Out of Scope

- Self-editing `hire_date` (explicitly decided as admin/`can_edit`-only).
- Showing this card anywhere other than Home (e.g. not added to "Mi perfil", which today just redirects to the contact edit form).
