# Attendance System — Sub-project 1: Hikvision Collection Agent — Design

**Status:** Approved, ready for implementation plan.

## Context

This is the first of four sub-projects that together make up a full attendance/time-tracking system:

1. **This spec** — a standalone agent that collects punch events from Hikvision face-recognition terminals (model `DS-K1T321EFWX`, ISAPI-capable) and pushes them to the cloud, plus the minimal cloud-side pieces needed to receive and store that data.
2. Horarios (schedules) — company-wide default + per-employee override, shown on the contact profile.
3. Bitácora (attendance log) UI for supervisors — entry = first punch of the day, exit = last punch, compared against the assigned schedule.
4. (Folded into this spec, since the agent can't be tested without it) the ingestion API and raw-punches data model.

Sub-projects 2 and 3 are deferred until real punch data is flowing from this one.

## Summary

One Node.js/TypeScript console application ("the agent") runs on a Windows PC in the office, on the same LAN as one or more Hikvision terminals. It:

- Polls each registered terminal's ISAPI every ~20 seconds for new punch events, independent of internet connectivity.
- Stores every captured punch in its own local SQLite database immediately.
- Separately, tries to push any not-yet-synced local punches to the cloud every ~20-30 seconds. If the internet is down, rows simply stay unsynced and get retried automatically on the next cycle — nothing is lost.
- Shows a live console window listing recent captures and how many are pending vs. synced, read straight from that local database.
- Starts automatically via the Windows Startup folder when the PC boots.

The cloud side is a small addition to the existing GenteBusiness Next.js app: two tables, two API routes the agent talks to (authenticated with a shared secret, not a user login), a new `hikvision_employee_no` field on contacts so a captured punch can be tied to a real person, and a small admin page to register terminals (IP/user/password) without redeploying the agent.

## Data Model

```sql
create table public.time_clock_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ip_address text not null,
  username text not null,
  password text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.time_clock_devices enable row level security;
-- No policies, intentionally: this table holds device passwords. Same
-- precedent as email_settings.smtp_pass (20260728100400_email_settings.sql)
-- - RLS enabled with zero policies denies anon/authenticated entirely. Only
-- the service-role client (from the /api/attendance/* routes, after checking
-- the shared agent secret) and the admin UI's server actions (after an
-- explicit get_my_module_permissions('attendance_devices').can_manage check)
-- may touch it.

create table public.time_clock_punches (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.time_clock_devices (id),
  employee_no_string text not null,
  contact_id uuid references public.contacts (id),
  punched_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (device_id, employee_no_string, punched_at)
);

alter table public.time_clock_punches enable row level security;
-- No policies for the same reason: written only by /api/attendance/punches
-- via the service-role client. Sub-project 3 (bitácora UI) will add a real
-- select policy scoped to "your own punches or your direct reports'" - out
-- of scope here since there's no viewing UI yet.

alter table public.contacts add column hikvision_employee_no text;
```

`enforce_contacts_update_permissions()` (from `20260730120000_contacts_self_edit.sql`) needs `hikvision_employee_no` added to its **admin-only** field-comparison tuple, same as `hire_date` was — editable only by `can_edit` users via `ContactForm`, never self-editable.

`contact_id` on `time_clock_punches` is nullable: if a captured `employee_no_string` doesn't match any contact's `hikvision_employee_no` yet, the punch is still stored (nothing is dropped) with `contact_id = null`. An admin can link the person later by setting their `hikvision_employee_no` — sub-project 3's bitácora UI will need to surface unmatched punches so this is discoverable, but that's out of scope for this spec.

## Ingestion API

Two Next.js API routes, both authenticated by comparing an `Authorization: Bearer <secret>` header against a new `ATTENDANCE_AGENT_SECRET` env var (one office, one agent, so one shared secret is enough — no per-device keys). Both use the Supabase service-role client to bypass the zero-policy RLS above. A request with a missing/wrong secret gets a 401 before touching the database.

- **`GET /api/attendance/devices`** → returns all `time_clock_devices` where `is_active = true` (id, name, ip_address, username, password). The agent calls this at startup and periodically (e.g. every 5 minutes) to pick up newly-registered terminals without a restart.
- **`POST /api/attendance/punches`** → body is an array of `{ device_id, employee_no_string, punched_at }`. For each: look up `contacts.hikvision_employee_no` to resolve `contact_id` (null if no match), then upsert into `time_clock_punches` (the unique constraint makes re-sending the same punch a safe no-op — important since the agent may retry a batch it's unsure was received). Returns which rows were newly inserted vs. already existed, so the agent can mark all of them `synced` locally either way.

## Admin UI

New module `attendance_devices` (label "Ponchadores"), same shape as every other admin module this session (`get_my_module_permissions('attendance_devices')`, gated by `can_manage`). A new page `/(admin)/attendance-devices` lists registered terminals with a form (name, IP, username, password) to add/edit/deactivate one — modeled directly on the existing `CompanyForm`/`ActivityForm` dialog pattern. No delete for now (use `is_active = false` instead, matching how contacts use `status` rather than hard deletes).

## The Agent Application

New top-level folder `attendance-agent/` (sibling to `src/`), a separate Node.js/TypeScript project with its own `package.json` — not built or bundled by the Next.js app.

**Local database** (`better-sqlite3`, a file like `attendance-agent.db` next to the executable):

```sql
create table devices (
  id text primary key,       -- matches the cloud time_clock_devices.id
  name text not null,
  ip_address text not null,
  username text not null,
  password text not null
);

create table punches (
  id integer primary key autoincrement,
  device_id text not null,
  employee_no_string text not null,
  punched_at text not null,   -- ISO string
  raw_event_id text,          -- the device's own event/serial number, for local dedup
  synced integer not null default 0,
  unique (device_id, employee_no_string, punched_at)
);
```

**Three independent loops, each on its own timer:**

1. **Device-list refresh** (every 5 min, best-effort): `GET /api/attendance/devices` with the shared secret, upsert into the local `devices` table. Skipped silently on failure — the agent keeps using whatever device list it already has cached.
2. **Polling loop** (every ~20s, per device): authenticate to the terminal via HTTP Digest (the `digest-fetch` npm package — Hikvision's ISAPI requires Digest, not Basic), call `POST http://{ip}/ISAPI/AccessControl/AcsEvent?format=json` with a time-range search covering "since the last punch we have locally for this device" through now, insert new rows into the local `punches` table (`synced = 0`). The exact response field names (`employeeNoString`, `time`, etc.) need confirming against this specific firmware (`V3.9.3 build 240701`) during implementation — Hikvision's documented shape is consistent across DS-K1T firmware lines but this should be verified with one real call before writing the parser.
3. **Sync loop** (every ~20-30s): select local `punches` where `synced = 0`, POST them in a batch to `/api/attendance/punches`, mark `synced = 1` on success. A failed request (network error, non-2xx) leaves them `synced = 0` for the next cycle — this is the entire offline-resilience mechanism, no separate queue needed.

**Console monitor**: on each loop tick, re-render a simple text view — last ~20 punches (name/number, device, time, synced ✓/pending), and counts (total today, pending count). Plain `console.log`/`console.clear()` redraw is enough; no TUI library needed for a first version.

**Startup**: the agent's build step drops a `.lnk` (or a small `.cmd` wrapper) into the current Windows user's Startup folder (`shell:startup`) pointing at the packaged executable, so it launches automatically at login. Packaging the Node app into a single `.exe` (e.g. via `pkg` or Node's built-in single-executable-application support) is the implementer's call based on what's most reliable to build/distribute — either way, the end result must be one file a non-technical person can leave running.

**Config**: the cloud API base URL and `ATTENDANCE_AGENT_SECRET` are read from a `.env` file next to the executable (not committed) — the same secret value must be set in the Next.js app's own environment for the API routes to accept it.

## Error Handling

- Digest auth failure or unreachable device (wrong IP/credentials, device offline): logged in the console monitor as an error for that device, that device's poll is skipped this cycle, others continue normally.
- Malformed/unexpected ISAPI response shape: logged with the raw response body (truncated) so a firmware quirk can be diagnosed later, that poll cycle's results for that device are discarded rather than partially parsed.
- Ingestion API rejects a batch (e.g. 401 from a misconfigured secret): logged clearly in the console ("check ATTENDANCE_AGENT_SECRET") since this is the most likely first-setup mistake; rows stay unsynced and retry indefinitely.

## Testing

- `time_clock_punches`'s unique constraint and `contact_id` resolution logic in `/api/attendance/punches` get integration tests following this codebase's existing RLS/API test precedent (`documentStampsRls.test.ts`, `logosRls.test.ts`): posting the same punch twice is a no-op, an unmatched `employee_no_string` stores with `contact_id = null`, a request with a missing/wrong secret is rejected.
- The agent's ISAPI-parsing and local-dedup logic gets unit tests using a captured/mocked sample response shape (not a live device) — verified against one real call during manual implementation testing, then frozen as a fixture.

## Out of Scope

- Any UI for viewing punches/bitácora (sub-project 3).
- Horarios/schedules (sub-project 2).
- Resolving a punch retroactively once an admin links a previously-unmatched `hikvision_employee_no` (the existing unmatched rows stay `contact_id = null` until a future backfill — not needed until sub-project 3 exists to display them).
- Multiple offices/locations (confirmed out of scope for now — all current terminals are on one LAN behind one agent).
- Push-based (real-time) event notification from the device — polling was chosen for simplicity; push is a possible future upgrade if 20-second latency ever becomes a real problem.
