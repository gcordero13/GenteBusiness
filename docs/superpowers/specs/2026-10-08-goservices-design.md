# GoServices Module — Design

## Context

GoServices is a new internal request/ticketing system for two kinds of operational requests — **Mantenimiento** (facilities maintenance) and **Mensajería** (courier/errand requests, including the new "Traslados" type). It lives entirely inside Gente Sánchez Business (Next.js + Supabase), not as a separate app — an earlier direction (separate Node.js + MySQL app on Hostinger) was explicitly dropped in favor of reusing this codebase's existing module/permission/notification patterns. It is unrelated to the existing `maintenance` module (which tracks a different, pre-existing maintenance workflow) — GoServices is additive, not a replacement.

## Roles

Three ways a person interacts with GoServices, none of which require a new concept of "role" beyond the existing `app_users`/`contacts`:

- **Solicitante** — any authenticated platform user. Can create a request and see the status of their own past requests. No permission check.
- **Ejecutor** — whoever a request gets assigned to (picked from any registered contact by the Supervisor/Líder — no separate "Utility"/"Mensajero" flag is introduced). Sees only requests assigned to them, and can update their status. No permission check — visibility is by assignment, not by role profile.
- **Supervisor/Líder** — gated by a new `goservices` module (`can_view` in `role_profile_permissions`, same mechanism as every other module in this app). Sees **all** requests of both types together (not split by type — a maintenance supervisor can also see Mensajería requests, per design conversation), can filter by type/status, assign an ejecutor, and change status.

## Data Model

```sql
create table public.goservices_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  request_type text not null check (request_type in ('mantenimiento', 'mensajeria')),

  requester_app_user_id uuid not null references public.app_users (id),
  requester_contact_id uuid references public.contacts (id),
  -- Snapshotted at submission time, same reasoning as vacation_requests.first_name/last_name.
  requester_name text not null,

  -- Mantenimiento only
  ubicacion text check (ubicacion in ('oficina', 'alojamiento')),
  categoria text check (categoria in ('cerrajeria', 'mobiliario', 'instalaciones_electricas', 'plomeria', 'infraestructura')),
  subcategoria text,

  -- Mensajería only
  tipo_mensajeria text check (tipo_mensajeria in ('envio', 'retiro', 'compras', 'traslados')),
  contacto_nombre text,
  contacto_telefono text,
  contacto_direccion text,

  detalle text not null,
  foto_url text,
  documento_url text,

  status text not null default 'recibido' check (status in ('recibido', 'en_proceso', 'completado', 'cancelado')),
  assigned_app_user_id uuid references public.app_users (id),

  check (
    (request_type = 'mantenimiento' and ubicacion is not null and categoria is not null and tipo_mensajeria is null)
    or
    (request_type = 'mensajeria' and tipo_mensajeria is not null and ubicacion is null and categoria is null)
  )
);
```

Subcategory values (e.g. Mobiliario → Compra/Cambio/Reparación/Instalación) are validated client-side by the form (the subcategory `Select` only ever offers the options valid for the chosen category) rather than as a DB check constraint — this is the first nested category→subcategory field in this codebase, and a flat check constraint covering every valid (categoria, subcategoria) pair would be harder to read and extend than the UI simply never offering an invalid combination. `subcategoria` is nullable (Cerrajería has none).

Full category/subcategory lists:

| Categoría | Subcategorías |
|---|---|
| Mobiliario | Compra, Cambio, Reparación, Instalación |
| Plomería | Reparación, Cambio, Fugas |
| Cerrajería | (ninguna) |
| Infraestructura | Pintura, Filtraciones, Pisos, Reparación de paredes |
| Instalaciones eléctricas | Cambio de iluminaria, Revisión de tomacorriente, Revisión de electrodoméstico |

Mensajería "Tipo de solicitud": Envío, Retiro, Compras, Traslados.

## RLS

- **Insert**: `requester_app_user_id = auth.uid()` — any authenticated user can create their own request. No anonymity concern here (unlike Quejas), so a direct RLS policy is used instead of a security-definer submit function.
- **Select**: visible to the requester (`requester_app_user_id = auth.uid()`), the assigned ejecutor (`assigned_app_user_id = auth.uid()`), or anyone with `can_view` on the `goservices` module (reusing the same module-permission-check pattern already used for Ponchador/Mantenimiento RLS).
- **Update** (status, `assigned_app_user_id`): assigned ejecutor or `can_view` on `goservices` only — the original requester can see their request but not edit it or change its status.

## Screens

- **`/solicitudes/goservices/nueva`** — always visible in the sidebar under the existing "Solicitudes" group (next to Vacaciones), open to everyone. A type toggle (Mantenimiento/Mensajería) switches the visible fields: Ubicación → Categoría → Subcategoría for Mantenimiento; Tipo de solicitud + Nombre de contacto/Teléfono/Dirección for Mensajería. `Detalle` (textarea) and photo/document upload are common to both and always shown.
- **`/solicitudes/goservices`** — "Mis solicitudes", always visible, lists the signed-in user's own requests with type, date, and status badge (Recibido/En proceso/Completado/Cancelado), read-only.
- **`/solicitudes/goservices/asignadas`** — "Mis tareas asignadas", always visible, lists requests assigned to the signed-in user; each row lets them move the status forward (same status set).
- **`/goservices`** (or similar top-level entry, gated by `can_view` on the `goservices` module) — Supervisor/Líder dashboard: all requests, filterable by type and status, with controls to assign an ejecutor and change status.

## Notifications

Any status change to `recibido`, `completado`, or `cancelado` (not `en_proceso`) sends an automatic email to the requester, reusing the existing nodemailer + `email_settings` sending path already used by `sendVacationRequestEmail.ts`/`sendComplaintNotificationEmail.ts` — no new email infrastructure.

## Attachments — SharePoint via Microsoft Graph

Photo/document uploads go to the `GoServices` SharePoint site (`https://fciudaddelsol.sharepoint.com/sites/GoServices`) via Microsoft Graph, using app-only (client-credentials) auth. Only the resulting file URL is stored (`foto_url`/`documento_url`), the same shape as `contacts.photo_url` — no new storage abstraction needed elsewhere in the app.

Credentials (never committed, env vars only):
- `ONEDRIVE_CLIENT_ID` (`70841144-af07-4e0f-a996-156a6701b4e4`)
- `ONEDRIVE_TENANT_ID` (`f3a1c3dd-27a6-465e-b01b-b211c4839a37`)
- `ONEDRIVE_CLIENT_SECRET`
- `SHAREPOINT_SITE_URL` (`https://fciudaddelsol.sharepoint.com/sites/GoServices`)

## Testing

- RLS: requester sees only their own rows; ejecutor sees only rows assigned to them; `can_view`-on-`goservices` user sees all rows regardless of type; a user with none of the three sees nothing.
- Insert: a user cannot insert a request with someone else's `requester_app_user_id`.
- Update: requester cannot change status of their own request; assigned ejecutor and `can_view` users can.
- Check constraint: a `mantenimiento` row with `tipo_mensajeria` set (or vice versa) is rejected; a `mantenimiento` row missing `ubicacion`/`categoria` is rejected.
- Notification: status change to each of recibido/completado/cancelado triggers one email; change to `en_proceso` triggers none.

## Addendum (2026-10-09) — Phase 2

Added after initial build, based on direct user feedback once the feature was live on a preview deploy:

- **Ejecutores**: instead of a new allow-list table, reuse the existing `role_profile_permissions` row for the `goservices` module — `can_add` now means "members of this role profile are eligible to be assigned a request" (repurposed; it was otherwise unused for this module, since request creation itself is open to everyone regardless of permission). `listAssignableUsers()` now filters to role profiles with `can_add = true` on `goservices`, mirroring the existing modules→role_profile_permissions→app_users join already used for RRHH email lookup in `solicitudes/vacaciones/actions.ts`. `can_view` continues to mean "gestor" (full oversight), unchanged. The user explicitly chose this over a new per-person list ("prefiero usar Perfiles de rol").
- **Status dashboard**: a responsive status-count summary (Total/Recibido/En proceso/Completado/Cancelado) on all three screens — full/unfiltered counts on the Gestión dashboard, scoped to "my own rows" on Mis Solicitudes and Mis Tareas Asignadas.
- **Image modal viewer**: `uploadToSharePoint` previously returned only `webUrl` (a SharePoint page-viewer link, not a raw byte URL — unsuitable for `<img src>`, and requires the viewer's own M365 session to open). Fixed by capturing the upload response's `driveId`/`itemId`, adding a server-side proxy route (`/api/goservices/attachment/[driveId]/[itemId]`) that fetches a fresh, app-authenticated Graph download URL on each request (Graph's `@microsoft.graph.downloadUrl` is short-lived, so it can't be stored — only `driveId`/`itemId` are persisted), and rendering photos through that proxy inside a Dialog instead of a new-tab link. Documents keep the simple link-out behavior (not all document types render as an image).

## Out of Scope

- A formal "Utility"/"Mensajero" role or tag — assignment is just picking any registered contact.
- Reassignment history/audit trail.
- SharePoint upload retry/offline queueing — a failed upload simply surfaces an error on the form, same as any other upload in this app.
- Editing a request after submission (only status/assignment can change).
