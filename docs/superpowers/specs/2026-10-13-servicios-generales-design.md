# Servicios Generales — Design

## Context

A new module for scheduled/preventive and reactive maintenance of company assets and facility services — vehicles (oil changes, tires, batteries), air conditioning (cleaning, servicing), fumigation, equipment/installations (electrical, computers), and buildings/areas (general cleaning/upkeep). It is explicitly **not** related to either existing "maintenance" thing in this codebase:

- The **`maintenance`** module (routes `/maintenance`, `/mantenimiento/[token]`) is IT/equipment preventive-maintenance checklists with signatures, PDF reports, and satisfaction surveys — a completely different, unrelated workflow.
- GoServices' **`mantenimiento`** request type already has a "Servicios Generales" role profile handling facilities tickets (cerrajería, plomería, eléctrico, etc.), assigned to an individual ejecutor per ticket. Confirmed with the user: the new module is **deliberately separate** and does not touch GoServices — it's calendar/schedule-based asset upkeep managed by a team, not individually-assigned tickets.

The visual reference the user provided (a "Mantenimiento Global" mockup) drives the UI shape: a category strip, a monthly calendar of scheduled items, a creation panel, a legend, and a "próximos mantenimientos" list. Per the user, the module/menu name is **"Servicios Generales"** and the page's own H1 also says "Servicios Generales" (not "Mantenimiento Global", despite the reference image's title).

## Permissions

New module, `module_key: 'servicios_generales'`:

- `can_view` — anyone can see the calendar, the categories, and the "Próximos mantenimientos" list (read-only transparency, same spirit as Suministros' open catalog).
- `can_manage` — the Servicios Generales team: create, edit, complete, or cancel a maintenance record or series, and export the CSV report. This is the only write permission this module uses.

No assignment-to-an-individual concept (unlike GoServices) — any `can_manage` user can act on any record, since it's a shared team queue. No separate `can_add`/`can_edit`/`can_authorize` — one flag governs all writes, like Suministros' despachador (`can_manage`) pattern.

## Categories

Fixed set (not admin-editable in v1 — a new category would be a small code change, since each one also carries a display icon/color):

| key | Label | Example | Color |
|---|---|---|---|
| `aires_acondicionados` | Aires Acondicionados | Lavado, limpieza y revisión | teal |
| `vehiculos` | Vehículos | Aceites, gomas, baterías y más | green |
| `fumigacion` | Fumigación | Control de plagas y sanitización | purple |
| `equipos_instalaciones` | Equipos e Instalaciones | Eléctricos, computadoras, etc. | amber |
| `edificios_areas` | Edificios y Áreas | Limpieza y mantenimiento general | blue |

## Data Model

```sql
create table public.general_maintenance_series (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'aires_acondicionados', 'vehiculos', 'fumigacion', 'equipos_instalaciones', 'edificios_areas'
  )),
  department_id uuid references public.departments(id),
  description text not null,
  frequency_interval integer not null check (frequency_interval > 0),
  frequency_unit text not null check (frequency_unit in ('dias', 'semanas', 'meses')),
  is_active boolean not null default true,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create table public.general_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.general_maintenance_series(id),
  category text not null check (category in (
    'aires_acondicionados', 'vehiculos', 'fumigacion', 'equipos_instalaciones', 'edificios_areas'
  )),
  department_id uuid references public.departments(id),
  description text not null,
  scheduled_date date not null,
  status text not null default 'programado' check (status in ('programado', 'completado', 'vencido', 'cancelado')),
  completed_at timestamptz,
  completed_by uuid references public.app_users(id),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create index general_maintenance_records_date_idx on public.general_maintenance_records(scheduled_date);
create index general_maintenance_records_series_idx on public.general_maintenance_records(series_id);
```

`series_id` is null for one-off records — this covers both a single scheduled item (e.g. a one-time equipment inspection) and a reactive/ad-hoc entry (a reported failure, logged by the Servicios Generales team with `scheduled_date` = today). There's no separate "reactive" flag; a one-off record dated today *is* the reactive case.

**Recurrence**: when a `can_manage` user completes a record whose `series_id` points to an **active** series, the server action creates the next record in that series (`scheduled_date` = completed record's date + `frequency_interval`/`frequency_unit`, same `category`/`department_id`/`description`, `status = 'programado'`). This is application logic (inside the "mark as completed" action), not a DB trigger — consistent with keeping recurrence math in one reviewable place. Setting `series.is_active = false` ("cancelar la serie") stops this without touching history.

**`vencido`**: computed lazily, not cron-driven — same precedent as the existing `maintenance` module's `expirado` status. The list/calendar query flips any `programado` record whose `scheduled_date < today` to `vencido` on read (a small `UPDATE ... WHERE status = 'programado' AND scheduled_date < current_date` before the `SELECT`, or an equivalent one-pass correction in the server action).

## RLS

- **Select** (`general_maintenance_records`, `general_maintenance_series`): `auth.uid() is not null` — every authenticated user can view (matches `can_view` being universal/no-op here; simpler than checking the flag since there's no case where an authenticated user shouldn't see it, same as Suministros' article catalog).
- **Insert/Update/Delete**: `coalesce((select can_manage from public.get_my_module_permissions('servicios_generales')), false)`.

## Screens

**Sidebar**: the existing flat "Mantenimientos" link (→ `/maintenance`, gated by `canViewMaintenance`) becomes a `FlyoutNavGroup` (same component built for Ajustes/Suministros) with two sub-links — "Mantenimiento de TI" (→ `/maintenance`, same permission as today) and "Servicios Generales" (→ `/servicios-generales`, gated by `can_view` on the new module, which every authenticated user has) — mirroring the reference image's "Mantenimientos" parent with "Mantenimiento Global" nested under it, instead of adding a second, confusingly-named top-level entry.

- **`/servicios-generales`** — single page:
  - Header "Servicios Generales" + "Exportar reporte" (CSV, `can_manage` only) + "Crear mantenimiento" button (`can_manage` only) opening the creation form in a dialog.
  - 5 category cards (icon, label, example text) — purely informational, matching the reference image; optionally clickable to filter the calendar/list by category.
  - Monthly calendar (prev/next month navigation) with a colored dot + short label per record on its `scheduled_date` cell.
  - Creation dialog (`can_manage` only): Categoría (select), Departamento (select from `departments`), Fecha programada (date), Descripción (textarea), and a "¿Se repite?" toggle that reveals Frecuencia (number + unidad: días/semanas/meses) when on. Saving a non-repeating entry creates a single record with no `series_id`; saving a repeating one creates both the `series` row and its first `record`.
  - Legend of the 5 categories with their colors.
  - "Próximos mantenimientos" table (next N upcoming, sorted by date) with Fecha/Tipo/Descripción/Área columns, each row clickable (`can_manage`) to mark completed or cancel.

## Out of scope for v1

- No signatures, PDF generation, or satisfaction surveys (that's the unrelated `maintenance` module's territory).
- No per-record assignment to an individual — any `can_manage` user can act on any record.
- No admin UI for adding new categories (a 6th category is a small code change, not a data-driven list, since each needs an icon/color choice anyway).
- No automatic reminders/notifications for upcoming or overdue items — the calendar view itself is the "alert."
