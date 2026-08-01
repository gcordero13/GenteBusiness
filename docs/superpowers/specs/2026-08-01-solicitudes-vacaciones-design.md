# Solicitudes: Vacaciones — Design Spec

**Goal:** Add a new "Solicitudes" area to the app, starting with one concrete request type — Vacaciones (vacation requests) — digitizing the paper "Formulario Solicitud de Vacaciones". An employee submits their own request; it routes to their direct supervisor for approval, then to Recursos Humanos (RRHH) for final approval/classification.

**Scope note:** This is the first of several planned request types (Mantenimientos de servicios generales, Envíos are known future additions, each with a different designated approver). This spec covers only Vacaciones end-to-end, but the module/permission architecture is built to add sibling request types later without restructuring what's built here.

## Architecture

**New module:** `solicitudes_vacaciones` (registered like every other module: `can_view`, `can_add`, `can_edit`, `can_delete`, `can_deactivate`, `can_manage`, `can_authorize` — only `can_view` and `can_authorize` are meaningfully used here). A future `solicitudes_mantenimiento` / `solicitudes_envios` module would follow the identical pattern with a different `can_authorize` holder.

**Authorization has two layers, matching the two real actors:**

1. **Baseline (every authenticated `app_user`, no permission flags required)** — mirrors the existing contact self-edit precedent (`email = auth.uid()`'s email bypasses the normal permission check). Every employee can, with zero module permissions:
   - Create their own vacation request.
   - View their own requests and their status.
   - Approve/reject a request **where the system resolves them as the requester's direct supervisor**.
2. **`can_authorize` on `solicitudes_vacaciones`** — held by RRHH (as a role-profile permission, not a hardcoded person, so it's adjustable later without a code change). Grants: seeing every request system-wide that has reached the RRHH stage, and making the final approval/rejection + classification.
   - `can_view` (separate from `can_authorize`) additionally grants a supervisory "see everything" list view, for oversight roles that shouldn't approve.

**Resolving "jefe directo":** via the existing `contacts.reports_to_id` self-referencing FK (already in the schema, unused for authorization until now). Chain: requester's `app_users.email` → matching `contacts` row → `reports_to_id` → that contact's `email` → matching `app_users` row = the supervisor who can act. This chain is resolved and **snapshotted onto the request at submission time** (`supervisor_app_user_id`), so a later org-chart change doesn't retroactively reroute an in-flight request.

**Submission is blocked** (with a clear inline error, not a silent misroute) if: the requester has no matching `contacts` row, that contact has no `reports_to_id`, the supervisor contact has no matching `app_users` account, or the supervisor account is deactivated. The error message tells the employee this needs to be fixed on their contact record (by whoever manages Agenda), rather than failing open to RRHH or failing silently.

## Data model

New table `vacation_requests`:

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `contact_id`, `requester_app_user_id` | who submitted it |
| `first_name`, `last_name`, `position`, `company_name`, `department_name` | snapshotted from the requester's contact at submission time (matches the `maintenance_records` snapshot pattern already used elsewhere in this app — survives later contact edits/deletion) |
| `period` | free text, e.g. "2026" — matches the paper form's blank "Vacaciones correspondiente al período" field |
| `days_requested` | integer |
| `date_from`, `date_to`, `return_date` | dates |
| `days_pending` | integer, self-reported by the employee (no automatic leave-balance tracking exists in this app today — building one is a separate project, out of scope here) |
| `notes` | employee's own free-text notes, optional |
| `status` | `pendiente_supervisor` \| `pendiente_rrhh` \| `aprobado` \| `rechazado` |
| `supervisor_app_user_id` | resolved + snapshotted at submission |
| `supervisor_decision`, `supervisor_decided_at`, `supervisor_comments`, `supervisor_signature_path` | |
| `rrhh_decision`, `rrhh_decided_at`, `rrhh_decided_by`, `rrhh_comments`, `rrhh_signature_path` | |
| `rrhh_period_confirmed`, `rrhh_has_current_vacation`, `rrhh_is_advance` | RRHH's own classification fields from the paper form's approval box ("Período al que responde", "Tiene vacaciones vigente", "Tomará vacaciones por adelantada") — filled only at the RRHH stage, not by the employee |
| `created_at` | |

RLS: baseline self/supervisor access via the email-match + `reports_to_id` chain (evaluated in a `security definer` helper function, same style as `enforce_contacts_update_permissions`); `can_view`/`can_authorize` via `get_my_module_permissions('solicitudes_vacaciones')`.

## Signatures (reusing the existing signature gallery)

Approving (by either the supervisor or RRHH) opens the **same signature picker already built for Sellos y Firmas** (`user_signatures` table, `user-signatures` bucket, the `SignatureDialog` component and its `saveSignature`/`deleteSignature` actions) — pick a previously-saved signature with one click, or draw and save a new one. That component and its backing data are generic (owner-only RLS, no `document_stamps`-specific coupling), so it's reused as-is rather than rebuilt.

The picked signature image is then **copied** into a `vacation-request-signatures` bucket path scoped to this request (`{request_id}/supervisor.png` or `{request_id}/rrhh.png`) at the moment of approval — an immutable record of what was actually approved, unaffected if the user later changes or deletes their saved signature. This mirrors how Mantenimiento snapshots signatures onto the completed record rather than keeping a live reference.

Rejecting does **not** require a signature — only Aprobar is an act of sign-off; a plain button + optional comment covers Rechazar.

## Workflow & notifications

```
Empleado envía → pendiente_supervisor
  Jefe aprueba (firma) → pendiente_rrhh
  Jefe rechaza (sin firma) → rechazado [fin]

pendiente_rrhh
  RRHH aprueba (firma + clasificación) → aprobado [fin]
  RRHH rechaza (sin firma) → rechazado [fin]
```

Email at every transition (reusing the branded HTML template already built for Mantenimiento):
- Enviada → email al jefe directo resuelto ("tienes una solicitud de vacaciones pendiente de tu aprobación").
- Jefe aprueba → email al empleado (progreso) + email a todo `app_user` con `can_authorize` en `solicitudes_vacaciones` (nueva pendiente de RRHH).
- Jefe rechaza → email al empleado (resultado final, con el comentario si lo hay).
- RRHH decide (cualquiera de los dos) → email al empleado (resultado final).

Rejected is a terminal state — no edit/resubmit flow; the employee can start a brand-new request if they want to try again (matches how the paper process already works).

## UI

**Sidebar:** new "Solicitudes" group (same collapsible-group pattern as the existing "Ajustes" group), with "Vacaciones" as its first (and for now only) child link.

**`/solicitudes/vacaciones`:** one list, scoped per viewer — the query returns exactly what's relevant to them (their own requests, any where they're the resolved supervisor, plus everything if they hold `can_view`/`can_authorize`) rather than a manually-toggled tab set. Approve/Reject buttons render per-row only where the viewer is the pending actor for that row's current stage. A "Nueva solicitud" dialog (matching the `NewMaintenanceDialog` pattern) creates a request, auto-filling name/puesto/empresa/departamento from the requester's own contact record (read-only in the form — not manually editable, since it's a snapshot of who they are, not a claim they type in).

## Testing

Unit tests (Vitest) for: the supervisor-resolution chain (including every blocked case), the state-transition action logic (approve/reject at each stage, including the FK/snapshot behavior), and the email content. An RLS integration test suite (matching `maintenanceRls.test.ts`) covering: a user with zero permissions can create/view their own request and act as a resolved supervisor, but cannot see or act on unrelated requests; `can_authorize` gates the RRHH stage; blocked-submission cases fail closed.

## Self-review

- **No placeholders.** Every field, transition, and permission check above is concrete.
- **Consistency check:** the snapshot-at-submission approach for both the requester's own info *and* the resolved supervisor is applied uniformly, so later edits to contacts/org-chart never retroactively change an in-flight request's routing or displayed data — matching the same reasoning already used for `maintenance_records`.
- **Scope check:** deliberately excludes automatic vacation-balance tracking, editing/resubmitting a rejected request, and the other two request types (Mantenimientos-generales, Envíos) — each is a separate follow-up sub-project reusing this same module/permission pattern.
