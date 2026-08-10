# Hikvision Attendance Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture attendance punches from Hikvision terminals and get them into GenteBusiness's Supabase database, via a Windows console agent that polls each terminal and syncs to a new cloud ingestion API.

**Architecture:** Two independent pieces, built in order. **Part A (cloud)** adds two zero-RLS-policy tables (`time_clock_devices`, `time_clock_punches`), a `contacts.hikvision_employee_no` column, two shared-secret-authenticated API routes (`GET /api/attendance/devices`, `POST /api/attendance/punches`), and a "Ponchadores" admin page to register terminals — all inside the existing Next.js app. **Part B (agent)** is a brand new standalone Node.js/TypeScript project (`attendance-agent/`, sibling to `src/`, its own `package.json`) that polls each terminal's Hikvision ISAPI over HTTP Digest auth, stores captures in a local SQLite database, syncs unsynced rows to Part A's API, and renders a live console monitor. Part B can only be fully tested once Part A is deployed, so Part A should ship first.

**Tech Stack:** Next.js 16 App Router + Supabase (existing app, Part A). Standalone Node.js/TypeScript + `better-sqlite3` + `digest-fetch` (new project, Part B). Vitest for both.

**Packaging decision (resolves the spec's open "implementer's call" on packaging):** `better-sqlite3` is a native addon, which does not bundle cleanly into Node's single-executable-application feature or into `pkg`. Rather than fight that, Part B ships as a plain folder (source + `node_modules`) that requires Node.js 20+ installed on the office PC, launched via a `.cmd` file dropped into the Windows Startup folder. This is simpler and more reliable than chasing a single-exe build for a native-addon project.

---

## File Structure

**Part A (this repo, `c:\Users\gcordero\Documents\GitHub\GenteBusiness`):**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260810120000_attendance_devices_and_punches.sql` | Create `time_clock_devices`/`time_clock_punches` (zero RLS), add `contacts.hikvision_employee_no`, extend the update-permissions trigger |
| `supabase/migrations/20260810120100_attendance_devices_module.sql` | Register the `attendance_devices` module + seed `role_profile_permissions` |
| `src/middleware.ts` (modify) | Exclude `/api/attendance/*` from the session-redirect check |
| `src/app/api/attendance/auth.ts` | Shared secret-header check used by both routes |
| `src/app/api/attendance/devices/route.ts` | `GET` — returns active devices for the agent |
| `src/app/api/attendance/punches/route.ts` | `POST` — upserts a punch batch, resolves `contact_id` |
| `src/test/integration/attendanceDevicesApi.test.ts` | Integration tests for the devices route |
| `src/test/integration/attendancePunchesApi.test.ts` | Integration tests for the punches route |
| `src/test/integration/attendanceDevicesModule.test.ts` | Module/permission seed-data test |
| `src/app/(app)/contacts/actions.ts` (modify) | Add `hikvision_employee_no` to `ContactInput`/`saveContact` |
| `src/app/(app)/contacts/ContactForm.tsx` (modify) | Add the "Número de empleado (Hikvision)" field |
| `src/app/(app)/contacts/[id]/page.tsx` (modify) | Pass `hikvision_employee_no` into `ContactForm`'s `initial` |
| `src/app/(app)/(admin)/attendance-devices/actions.ts` | `saveDevice` server action (admin-client writes, `can_manage`-gated) |
| `src/app/(app)/(admin)/attendance-devices/DeviceForm.tsx` | Create/edit dialog for one device |
| `src/app/(app)/(admin)/attendance-devices/page.tsx` | "Ponchadores" list page |

**Part B (new project, `c:\Users\gcordero\Documents\GitHub\GenteBusiness\attendance-agent`):**

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore` | Project scaffold |
| `src/db.ts` | Local SQLite schema + device/punch read-write functions |
| `src/hikvision.ts` | ISAPI request (HTTP Digest) + `AcsEvent` response parsing |
| `src/cloudApi.ts` | `fetchDevices`/`postPunches` against Part A's routes |
| `src/monitor.ts` | Pure console-rendering function |
| `src/index.ts` | Wires the three loops + monitor together |
| `src/installStartup.ts` | Drops a `.cmd` launcher into the Windows Startup folder |
| `src/digestFetch.d.ts` | Ambient type declaration (`digest-fetch` ships no types) |
| `README.md` | Setup instructions for whoever installs this on the office PC |

---

## Part A — Cloud ingestion

### Task 1: Migration — tables + contacts column + trigger update

**Files:**
- Create: `supabase/migrations/20260810120000_attendance_devices_and_punches.sql`

- [ ] **Step 1: Write the migration file**

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
-- the service-role client (used server-side in the /api/attendance/* route
-- handlers after checking the shared agent secret, and in the "Ponchadores"
-- admin server actions after an explicit
-- get_my_module_permissions('attendance_devices').can_manage check) may
-- read or write this table.

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
-- via the service-role client, after checking the shared agent secret.

alter table public.contacts add column hikvision_employee_no text;

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
  is_self boolean;
begin
  select * into flags from public.get_my_module_permissions('contacts');

  select exists (
    select 1 from public.app_users au
    where au.id = auth.uid() and au.email = old.email
  ) into is_self;

  if flags is null and not is_self then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.position, new.fleet_phone, new.extension, new.has_whatsapp
  ) is distinct from (
    old.position, old.fleet_phone, old.extension, old.has_whatsapp
  ) and not (is_self or coalesce(flags.can_edit, false)) then
    raise exception 'not authorized to edit contact fields';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.department_id, new.company_id,
    new.photo_url, new.reports_to_id, new.birth_date, new.hire_date, new.hikvision_employee_no
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date, old.hire_date, old.hikvision_employee_no
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;
```

- [ ] **Step 2: Hand the SQL to the user to run**

`supabase migration up` fails locally in this repo (`LegacyDbConfigConnectTempRoleError`, `SUPABASE_DB_PASSWORD` unset). Show the user the exact SQL block above and ask them to paste it into the Supabase SQL Editor. **Wait for their confirmation it ran successfully ("Success. No rows returned.") before starting Task 2 or any task that queries these tables/columns.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260810120000_attendance_devices_and_punches.sql
git commit -m "feat: add time_clock_devices/punches tables and contacts.hikvision_employee_no"
```

---

### Task 2: Migration — register the `attendance_devices` module

**Files:**
- Create: `supabase/migrations/20260810120100_attendance_devices_module.sql`

- [ ] **Step 1: Write the migration file**

```sql
insert into public.modules (key, label) values ('attendance_devices', 'Ponchadores');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, false, false, false, false, false, (rp.name = 'Super Admin'), false
from public.role_profiles rp
cross join public.modules m
where m.key = 'attendance_devices';
```

- [ ] **Step 2: Hand the SQL to the user to run**

Same as Task 1 — paste into the Supabase SQL Editor, wait for confirmation before continuing. This is what makes "Ponchadores" appear automatically in the "Perfiles de rol" permission editor (`src/app/(app)/(admin)/role-profiles/page.tsx` reads all rows from `modules`, no code change needed there).

- [ ] **Step 3: Write the module seed test**

Create `src/test/integration/attendanceDevicesModule.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("attendance_devices module seed data", () => {
  it("exists as a module with permission rows for every role profile, Super Admin granted can_manage by default", async () => {
    const admin = createAdminClient();

    const { data: moduleRow, error: moduleError } = await admin
      .from("modules")
      .select("id, key, label")
      .eq("key", "attendance_devices")
      .single();

    expect(moduleError).toBeNull();
    expect(moduleRow?.label).toBe("Ponchadores");

    const { data: permissionRows, error: permissionError } = await admin
      .from("role_profile_permissions")
      .select("can_manage, role_profiles(name)")
      .eq("module_id", moduleRow!.id);

    expect(permissionError).toBeNull();
    expect(permissionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          can_manage: true,
          role_profiles: expect.objectContaining({ name: "Super Admin" }),
        }),
        expect.objectContaining({
          can_manage: false,
          role_profiles: expect.objectContaining({ name: "Viewer" }),
        }),
      ]),
    );
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- attendanceDevicesModule`
Expected: PASS (the migration from Step 2 must already be applied, or this fails with "moduleRow is null")

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120100_attendance_devices_module.sql src/test/integration/attendanceDevicesModule.test.ts
git commit -m "feat: register attendance_devices module and seed permissions"
```

---

### Task 3: Shared secret env var + middleware bypass

**Files:**
- Modify: `.env.local` (not committed — `.env*` is gitignored)
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add the secret to `.env.local`**

Append a line to `.env.local` (in the worktree, `c:\Users\gcordero\Documents\GitHub\GenteBusiness\.worktrees\feature\attendance-hikvision-agent\.env.local`):

```
ATTENDANCE_AGENT_SECRET=<generate a random 32+ character string, e.g. via `openssl rand -hex 32`>
```

Tell the user this same value will need to be set in Vercel's environment variables (`vercel env add ATTENDANCE_AGENT_SECRET production`) before the agent can reach production, and copied into the agent's own `.env` file (Task 15's README setup steps).

- [ ] **Step 2: Add the middleware bypass**

In `src/middleware.ts`, find:

```ts
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/auth/confirm") ||
    request.nextUrl.pathname.startsWith("/mantenimiento") ||
    request.nextUrl.pathname.startsWith("/encuesta");
```

Replace with:

```ts
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/auth/confirm") ||
    request.nextUrl.pathname.startsWith("/mantenimiento") ||
    request.nextUrl.pathname.startsWith("/encuesta") ||
    request.nextUrl.pathname.startsWith("/api/attendance");
```

This is required — without it, every request to `/api/attendance/*` gets redirected to `/login` by the middleware before the route handler ever runs, since the agent calls these routes with no Supabase session cookie.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: exclude /api/attendance/* from the session-redirect middleware"
```

(`.env.local` is gitignored and won't be staged — that's expected.)

---

### Task 4: `GET /api/attendance/devices`

**Files:**
- Create: `src/app/api/attendance/auth.ts`
- Create: `src/app/api/attendance/devices/route.ts`
- Test: `src/test/integration/attendanceDevicesApi.test.ts`

- [ ] **Step 1: Write the shared auth helper**

```ts
import "server-only";
import type { NextRequest } from "next/server";

export function isAuthorizedAgentRequest(request: NextRequest): boolean {
  const secret = process.env.ATTENDANCE_AGENT_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/test/integration/attendanceDevicesApi.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/api/attendance/devices/route";

const SECRET = "test-secret-for-attendance-devices";
process.env.ATTENDANCE_AGENT_SECRET = SECRET;

function makeRequest(authHeader: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;
  return new NextRequest("http://localhost/api/attendance/devices", { headers });
}

describe("GET /api/attendance/devices", () => {
  let activeId: string;
  let inactiveId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (activeId) await admin.from("time_clock_devices").delete().eq("id", activeId);
    if (inactiveId) await admin.from("time_clock_devices").delete().eq("id", inactiveId);
    activeId = "";
    inactiveId = "";
  });

  it("rejects a request with no Authorization header", async () => {
    const response = await GET(makeRequest(null));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await GET(makeRequest("Bearer wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns only active devices, including credentials", async () => {
    const admin = createAdminClient();
    const { data: active } = await admin
      .from("time_clock_devices")
      .insert({
        name: "Entrada Activa",
        ip_address: "192.168.1.10",
        username: "admin",
        password: "secret",
        is_active: true,
      })
      .select()
      .single();
    activeId = active!.id;
    const { data: inactive } = await admin
      .from("time_clock_devices")
      .insert({
        name: "Entrada Inactiva",
        ip_address: "192.168.1.11",
        username: "admin",
        password: "secret",
        is_active: false,
      })
      .select()
      .single();
    inactiveId = inactive!.id;

    const response = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.devices).toEqual([
      { id: activeId, name: "Entrada Activa", ip_address: "192.168.1.10", username: "admin", password: "secret" },
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- attendanceDevicesApi`
Expected: FAIL — `Cannot find module '@/app/api/attendance/devices/route'`

- [ ] **Step 4: Write the route**

Create `src/app/api/attendance/devices/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedAgentRequest } from "../auth";

export async function GET(request: NextRequest) {
  if (!isAuthorizedAgentRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: devices, error } = await admin
    .from("time_clock_devices")
    .select("id, name, ip_address, username, password")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ devices: devices ?? [] });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- attendanceDevicesApi`
Expected: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/attendance/auth.ts src/app/api/attendance/devices/route.ts src/test/integration/attendanceDevicesApi.test.ts
git commit -m "feat: add GET /api/attendance/devices"
```

---

### Task 5: `POST /api/attendance/punches`

**Files:**
- Create: `src/app/api/attendance/punches/route.ts`
- Test: `src/test/integration/attendancePunchesApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/integration/attendancePunchesApi.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/attendance/punches/route";

const SECRET = "test-secret-for-attendance-punches";
process.env.ATTENDANCE_AGENT_SECRET = SECRET;

function makeRequest(body: unknown, authHeader: string | null): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;
  return new NextRequest("http://localhost/api/attendance/punches", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/attendance/punches", () => {
  let deviceId: string;
  let contactId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (deviceId) await admin.from("time_clock_punches").delete().eq("device_id", deviceId);
    if (deviceId) await admin.from("time_clock_devices").delete().eq("id", deviceId);
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    deviceId = "";
    contactId = "";
  });

  it("rejects a request with a missing Authorization header", async () => {
    const response = await POST(makeRequest({ punches: [] }, null));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(makeRequest({ punches: [] }, "Bearer wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("stores a punch with contact_id null when no contact matches the employee number", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const response = await POST(
      makeRequest(
        { punches: [{ device_id: deviceId, employee_no_string: "999", punched_at: "2026-08-10T08:00:00.000Z" }] },
        `Bearer ${SECRET}`,
      ),
    );
    expect(response.status).toBe(200);

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("contact_id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "999")
      .single();
    expect(stored?.contact_id).toBeNull();
  });

  it("resolves contact_id when a contact's hikvision_employee_no matches", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({ first_name: "Test", last_name: "Employee", hikvision_employee_no: "555" })
      .select()
      .single();
    contactId = contact!.id;

    const response = await POST(
      makeRequest(
        { punches: [{ device_id: deviceId, employee_no_string: "555", punched_at: "2026-08-10T08:00:00.000Z" }] },
        `Bearer ${SECRET}`,
      ),
    );
    expect(response.status).toBe(200);

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("contact_id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "555")
      .single();
    expect(stored?.contact_id).toBe(contactId);
  });

  it("is idempotent when the same punch is posted twice", async () => {
    const admin = createAdminClient();
    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Entrada Test", ip_address: "192.168.1.99", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const punch = { device_id: deviceId, employee_no_string: "999", punched_at: "2026-08-10T08:00:00.000Z" };
    await POST(makeRequest({ punches: [punch] }, `Bearer ${SECRET}`));
    await POST(makeRequest({ punches: [punch] }, `Bearer ${SECRET}`));

    const { data: stored } = await admin
      .from("time_clock_punches")
      .select("id")
      .eq("device_id", deviceId)
      .eq("employee_no_string", "999");
    expect(stored).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- attendancePunchesApi`
Expected: FAIL — `Cannot find module '@/app/api/attendance/punches/route'`

- [ ] **Step 3: Write the route**

Create `src/app/api/attendance/punches/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedAgentRequest } from "../auth";

interface IncomingPunch {
  device_id: string;
  employee_no_string: string;
  punched_at: string;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAgentRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { punches?: IncomingPunch[] };
  const punches = body.punches ?? [];
  if (punches.length === 0) {
    return NextResponse.json({ synced: [] });
  }

  const admin = createAdminClient();

  const employeeNumbers = Array.from(new Set(punches.map((p) => p.employee_no_string)));
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, hikvision_employee_no")
    .in("hikvision_employee_no", employeeNumbers);

  const contactByEmployeeNo = new Map(
    (contacts ?? []).map((c) => [c.hikvision_employee_no as string, c.id as string]),
  );

  const rows = punches.map((p) => ({
    device_id: p.device_id,
    employee_no_string: p.employee_no_string,
    punched_at: p.punched_at,
    contact_id: contactByEmployeeNo.get(p.employee_no_string) ?? null,
  }));

  const { data: upserted, error } = await admin
    .from("time_clock_punches")
    .upsert(rows, { onConflict: "device_id,employee_no_string,punched_at" })
    .select("device_id, employee_no_string, punched_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: upserted ?? [] });
}
```

Note: the route always recomputes `contact_id` on every write (including a duplicate/retry), rather than distinguishing "newly inserted" vs "already existed" rows. Both cases produce the exact same next action for the agent (mark synced), so tracking that distinction adds no real behavior — the spec's "returns which rows were newly inserted vs already existed" is satisfied in spirit by this simpler always-upsert approach.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- attendancePunchesApi`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/attendance/punches/route.ts src/test/integration/attendancePunchesApi.test.ts
git commit -m "feat: add POST /api/attendance/punches"
```

---

### Task 6: `hikvision_employee_no` on the contact form

**Files:**
- Modify: `src/app/(app)/contacts/actions.ts`
- Modify: `src/app/(app)/contacts/ContactForm.tsx`
- Modify: `src/app/(app)/contacts/[id]/page.tsx`

No dedicated test for this task: `hire_date`, the equivalent previous admin-only field addition, didn't get one either — coverage for this trigger lives in whatever existing contacts-permissions test already exercises `enforce_contacts_update_permissions`, and this task's tuple change follows that exact same pattern (already covered by Task 1's migration).

- [ ] **Step 1: Add the field to `ContactInput` and `saveContact`**

In `src/app/(app)/contacts/actions.ts`, find:

```ts
export interface ContactInput {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  extension: string;
  fleet_phone: string;
  has_whatsapp: boolean;
  company_id: string;
  department_id: string;
  position: string;
  birth_date: string;
  hire_date: string;
  reports_to_id: string;
  photo_url: string;
}
```

Replace with:

```ts
export interface ContactInput {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  extension: string;
  fleet_phone: string;
  has_whatsapp: boolean;
  company_id: string;
  department_id: string;
  position: string;
  birth_date: string;
  hire_date: string;
  hikvision_employee_no: string;
  reports_to_id: string;
  photo_url: string;
}
```

Then find, inside `saveContact`:

```ts
  const payload = {
    ...fields,
    email: fields.email || null,
    extension: fields.extension || null,
    fleet_phone: fields.fleet_phone || null,
    birth_date: fields.birth_date || null,
    hire_date: fields.hire_date || null,
    company_id: fields.company_id || null,
    department_id: fields.department_id || null,
    reports_to_id: fields.reports_to_id || null,
    photo_url: fields.photo_url || null,
  };
```

Replace with:

```ts
  const payload = {
    ...fields,
    email: fields.email || null,
    extension: fields.extension || null,
    fleet_phone: fields.fleet_phone || null,
    birth_date: fields.birth_date || null,
    hire_date: fields.hire_date || null,
    hikvision_employee_no: fields.hikvision_employee_no || null,
    company_id: fields.company_id || null,
    department_id: fields.department_id || null,
    reports_to_id: fields.reports_to_id || null,
    photo_url: fields.photo_url || null,
  };
```

- [ ] **Step 2: Add the field to the form**

In `src/app/(app)/contacts/ContactForm.tsx`, find the default-state object:

```ts
  const [form, setForm] = useState<ContactInput>(
    initial ?? {
      first_name: "",
      last_name: "",
      email: "",
      extension: "",
      fleet_phone: "",
      has_whatsapp: false,
      company_id: "",
      department_id: "",
      position: "",
      birth_date: "",
      hire_date: "",
      reports_to_id: "",
      photo_url: "",
    },
  );
```

Replace with:

```ts
  const [form, setForm] = useState<ContactInput>(
    initial ?? {
      first_name: "",
      last_name: "",
      email: "",
      extension: "",
      fleet_phone: "",
      has_whatsapp: false,
      company_id: "",
      department_id: "",
      position: "",
      birth_date: "",
      hire_date: "",
      hikvision_employee_no: "",
      reports_to_id: "",
      photo_url: "",
    },
  );
```

Then find the "Fecha de contratación" field block:

```tsx
      <div className="space-y-1">
        <Label>Fecha de contratación</Label>
        <Input
          type="date"
          value={form.hire_date}
          onChange={(e) => field("hire_date", e.target.value)}
        />
      </div>
```

Add immediately after it:

```tsx
      <div className="space-y-1">
        <Label>Número de empleado (Hikvision)</Label>
        <Input
          value={form.hikvision_employee_no}
          onChange={(e) => field("hikvision_employee_no", e.target.value)}
        />
      </div>
```

- [ ] **Step 3: Pass the field through on the edit page**

In `src/app/(app)/contacts/[id]/page.tsx`, find:

```tsx
          initial={{
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email ?? "",
            extension: contact.extension ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            has_whatsapp: contact.has_whatsapp,
            company_id: contact.company_id ?? "",
            department_id: contact.department_id ?? "",
            position: contact.position ?? "",
            birth_date: contact.birth_date ?? "",
            hire_date: contact.hire_date ?? "",
            reports_to_id: contact.reports_to_id ?? "",
            photo_url: contact.photo_url ?? "",
          }}
```

Replace with:

```tsx
          initial={{
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email ?? "",
            extension: contact.extension ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            has_whatsapp: contact.has_whatsapp,
            company_id: contact.company_id ?? "",
            department_id: contact.department_id ?? "",
            position: contact.position ?? "",
            birth_date: contact.birth_date ?? "",
            hire_date: contact.hire_date ?? "",
            hikvision_employee_no: contact.hikvision_employee_no ?? "",
            reports_to_id: contact.reports_to_id ?? "",
            photo_url: contact.photo_url ?? "",
          }}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev` in the worktree, log in as a `can_edit` user, open a contact's edit page, confirm the new "Número de empleado (Hikvision)" field appears below "Fecha de contratación", save a value, reload, confirm it persisted.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/contacts/actions.ts" "src/app/(app)/contacts/ContactForm.tsx" "src/app/(app)/contacts/[id]/page.tsx"
git commit -m "feat: add hikvision_employee_no field to the contact form"
```

---

### Task 7: "Ponchadores" admin page

**Files:**
- Create: `src/app/(app)/(admin)/attendance-devices/actions.ts`
- Create: `src/app/(app)/(admin)/attendance-devices/DeviceForm.tsx`
- Create: `src/app/(app)/(admin)/attendance-devices/page.tsx`

No dedicated test for the form/actions glue: this repo has no unit tests for any of its existing admin CRUD dialogs (`NewsForm.tsx`, `ActivityForm.tsx`, etc.) — coverage for this module comes from Task 2's seed-data test (permissions exist) and Task 4/5's route tests (the tables themselves work). This task is manually verified in Step 4.

- [ ] **Step 1: Write the server actions**

Create `src/app/(app)/(admin)/attendance-devices/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DeviceFields {
  name: string;
  ipAddress: string;
  username: string;
  password: string;
  isActive: boolean;
}

async function callerCanManageAttendanceDevices(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "attendance_devices",
  });
  return Boolean(data?.[0]?.can_manage);
}

export async function saveDevice(id: string | undefined, fields: DeviceFields) {
  if (!(await callerCanManageAttendanceDevices())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const payload = {
    name: fields.name,
    ip_address: fields.ipAddress,
    username: fields.username,
    password: fields.password,
    is_active: fields.isActive,
  };

  const query = id
    ? admin.from("time_clock_devices").update(payload).eq("id", id)
    : admin.from("time_clock_devices").insert(payload);

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath("/attendance-devices");
  return {};
}
```

This mirrors `callerCanManageSettings()` in `src/app/(app)/(admin)/settings/actions.ts` — the permission check runs against the caller's own session client, but the actual read/write happens via `createAdminClient()`, because `time_clock_devices` has zero RLS policies (Task 1) and a session-scoped client would be denied entirely.

- [ ] **Step 2: Write the form dialog**

Create `src/app/(app)/(admin)/attendance-devices/DeviceForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveDevice } from "./actions";

interface DeviceInitial {
  id: string;
  name: string;
  ipAddress: string;
  username: string;
  password: string;
  isActive: boolean;
}

export function DeviceForm({ initial }: { initial?: DeviceInitial }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [ipAddress, setIpAddress] = useState(initial?.ipAddress ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveDevice(initial?.id, { name, ipAddress, username, password, isActive });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!initial) {
        setName("");
        setIpAddress("");
        setUsername("");
        setPassword("");
        setIsActive(true);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nuevo ponchador</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar ponchador" : "Nuevo ponchador"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input placeholder="Ej. Entrada Principal" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Dirección IP</Label>
          <Input placeholder="192.168.1.50" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Usuario</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Contraseña</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Activo
        </label>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name || !ipAddress || !username || !password}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(app)/(admin)/attendance-devices/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Fingerprint } from "lucide-react";
import { DeviceForm } from "./DeviceForm";

export default async function AttendanceDevicesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "attendance_devices",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const admin = createAdminClient();
  const { data: devices } = await admin.from("time_clock_devices").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ponchadores</h1>
        <DeviceForm />
      </div>
      {(devices ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <Fingerprint className="size-8" />
          <p className="text-sm">No hay ponchadores registrados todavía.</p>
          <p className="text-xs">Crea el primero con el botón &quot;Nuevo ponchador&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(devices ?? []).map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.ip_address}</TableCell>
                <TableCell>
                  <Badge variant={d.is_active ? "default" : "secondary"}>
                    {d.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <DeviceForm
                      initial={{
                        id: d.id,
                        name: d.name,
                        ipAddress: d.ip_address,
                        username: d.username,
                        password: d.password,
                        isActive: d.is_active,
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, log in as a Super Admin, visit `/attendance-devices`, create a device, edit it, toggle "Activo" off and confirm the badge updates. Log in as a non-Super-Admin user and confirm visiting `/attendance-devices` redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/(admin)/attendance-devices"
git commit -m "feat: add Ponchadores admin page for managing attendance devices"
```

---

### Task 8: Part A checkpoint

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass except the 6 pre-existing Supabase-auth-rate-limited integration tests noted when the worktree was set up (unrelated to this feature — if a *different* set of tests is now failing, stop and investigate before continuing).

- [ ] **Step 2: Manual smoke test of both routes with curl**

Get a real device ID first — after Task 7's manual test created one, grab it from the Supabase Studio table editor. Then, from the worktree root:

```bash
curl -s https://<preview-or-local-url>/api/attendance/devices -H "Authorization: Bearer <ATTENDANCE_AGENT_SECRET>"
curl -s -X POST https://<preview-or-local-url>/api/attendance/punches \
  -H "Authorization: Bearer <ATTENDANCE_AGENT_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"punches":[{"device_id":"<real-device-id>","employee_no_string":"1","punched_at":"2026-08-10T12:00:00.000Z"}]}'
```

Expected: the first returns `{"devices":[...]}` with the device just created; the second returns `{"synced":[...]}` with one entry.

- [ ] **Step 3: Tell the user Part A is ready**

Report that the cloud side (migrations, both API routes, the Ponchadores admin page, and the contact field) is implemented and tested, and ask whether to deploy Part A now (so Part B can be built and tested against the live API) or continue straight to building the agent locally first.

---

## Part B — Standalone Hikvision agent

All of this lives in a new folder `attendance-agent/` at the repo root (sibling to `src/`), with its own `package.json` — it is not part of the Next.js app's build.

### Task 9: Scaffold the project

**Files:**
- Create: `attendance-agent/package.json`
- Create: `attendance-agent/tsconfig.json`
- Create: `attendance-agent/vitest.config.ts`
- Create: `attendance-agent/.env.example`
- Create: `attendance-agent/.gitignore`

- [ ] **Step 1: Create the directory and `package.json`**

Create `attendance-agent/package.json`:

```json
{
  "name": "attendance-agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "install-startup": "node dist/installStartup.js"
  },
  "dependencies": {
    "better-sqlite3": "^13.0.3",
    "digest-fetch": "^3.1.1",
    "dotenv": "^17.4.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^9.6.0",
    "@types/node": "^20",
    "typescript": "^5",
    "vitest": "^4.1.10"
  }
}
```

(Version note: the original plan pinned `better-sqlite3@^11.3.0`, which turned out to have no prebuilt binary for Node 24 — the dev machine building this had no working Python for a from-source `node-gyp` fallback, so `npm install` failed outright. Bumped to `^13.0.3`, confirmed to have a Node 24/win32-x64 prebuild and verified directly against the exact API this plan's `db.ts` uses — constructor, `.pragma()`, `.exec()`, `.prepare().run()`, `.transaction()` — all behave identically. `@types/better-sqlite3` bumped to `^9.6.0` to match; the types package versions independently of the runtime package and this is its latest release.)

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});
```

- [ ] **Step 4: Create `.env.example`**

```
ATTENDANCE_AGENT_SECRET=replace-with-the-same-value-set-in-the-Next.js-app
CLOUD_API_BASE_URL=https://gente-business.vercel.app
```

- [ ] **Step 5: Create `.gitignore`**

The repo root `.gitignore` uses `/node_modules` (anchored to the repo root only), so this sub-project needs its own:

```
node_modules/
dist/
*.db
*.db-wal
*.db-shm
```

(`.env*` is already ignored repo-wide by the root `.gitignore`, so `attendance-agent/.env` doesn't need a separate rule.)

- [ ] **Step 6: Install dependencies**

Run: `cd attendance-agent && npm install`
Expected: installs cleanly (both `better-sqlite3` and the rest ship prebuilt binaries for Windows x64; if `better-sqlite3` fails to install, it needs Visual Studio Build Tools with the "Desktop development with C++" workload — note this in the README in Task 15, but don't block on it now since it's expected to succeed on a normal Windows dev machine).

- [ ] **Step 7: Commit**

```bash
git add attendance-agent/package.json attendance-agent/package-lock.json attendance-agent/tsconfig.json attendance-agent/vitest.config.ts attendance-agent/.env.example attendance-agent/.gitignore
git commit -m "chore: scaffold the standalone attendance-agent project"
```

---

### Task 10: Local SQLite layer (`db.ts`)

**Files:**
- Create: `attendance-agent/src/db.ts`
- Test: `attendance-agent/src/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `attendance-agent/src/db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  openDb,
  upsertDevices,
  listDevices,
  insertPunchIfNew,
  unsyncedPunches,
  markSynced,
  pendingCount,
  lastPunchTime,
} from "./db.js";

describe("db", () => {
  it("upserts and lists devices", () => {
    const db = openDb(":memory:");
    upsertDevices(db, [
      { id: "d1", name: "Entrada", ipAddress: "192.168.1.50", username: "admin", password: "secret" },
    ]);
    expect(listDevices(db)).toEqual([
      { id: "d1", name: "Entrada", ipAddress: "192.168.1.50", username: "admin", password: "secret" },
    ]);
  });

  it("updates an existing device on re-upsert instead of duplicating it", () => {
    const db = openDb(":memory:");
    upsertDevices(db, [
      { id: "d1", name: "Entrada", ipAddress: "192.168.1.50", username: "admin", password: "old" },
    ]);
    upsertDevices(db, [
      { id: "d1", name: "Entrada Principal", ipAddress: "192.168.1.51", username: "admin", password: "new" },
    ]);
    const devices = listDevices(db);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "d1",
      name: "Entrada Principal",
      ipAddress: "192.168.1.51",
      username: "admin",
      password: "new",
    });
  });

  it("inserts a new punch and reports it as unsynced", () => {
    const db = openDb(":memory:");
    const inserted = insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    expect(inserted).toBe(true);
    expect(pendingCount(db)).toBe(1);
    const unsynced = unsyncedPunches(db);
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0]).toMatchObject({
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      synced: false,
    });
  });

  it("ignores a duplicate punch for the same device/employee/timestamp", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    const insertedAgain = insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1-retry",
    });
    expect(insertedAgain).toBe(false);
    expect(pendingCount(db)).toBe(1);
  });

  it("marks punches as synced and excludes them from unsyncedPunches", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    const [punch] = unsyncedPunches(db);
    markSynced(db, [punch.id]);
    expect(unsyncedPunches(db)).toHaveLength(0);
    expect(pendingCount(db)).toBe(0);
  });

  it("returns null lastPunchTime for a device with no local punches yet", () => {
    const db = openDb(":memory:");
    expect(lastPunchTime(db, "d1")).toBeNull();
  });

  it("returns the max punched_at for a device with punches", () => {
    const db = openDb(":memory:");
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "42",
      punchedAt: "2026-08-10T08:00:00.000Z",
      rawEventId: "evt-1",
    });
    insertPunchIfNew(db, {
      deviceId: "d1",
      employeeNoString: "43",
      punchedAt: "2026-08-10T09:00:00.000Z",
      rawEventId: "evt-2",
    });
    expect(lastPunchTime(db, "d1")).toBe("2026-08-10T09:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd attendance-agent && npm test`
Expected: FAIL — `Cannot find module './db.js'`

- [ ] **Step 3: Write `db.ts`**

Create `attendance-agent/src/db.ts`:

```ts
import Database from "better-sqlite3";

export interface StoredPunch {
  id: number;
  deviceId: string;
  employeeNoString: string;
  punchedAt: string;
  synced: boolean;
}

export interface StoredDevice {
  id: string;
  name: string;
  ipAddress: string;
  username: string;
  password: string;
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    create table if not exists devices (
      id text primary key,
      name text not null,
      ip_address text not null,
      username text not null,
      password text not null
    );

    create table if not exists punches (
      id integer primary key autoincrement,
      device_id text not null,
      employee_no_string text not null,
      punched_at text not null,
      raw_event_id text,
      synced integer not null default 0,
      unique (device_id, employee_no_string, punched_at)
    );
  `);
}

export function upsertDevices(db: Database.Database, devices: StoredDevice[]): void {
  const stmt = db.prepare(`
    insert into devices (id, name, ip_address, username, password)
    values (@id, @name, @ipAddress, @username, @password)
    on conflict(id) do update set
      name = excluded.name,
      ip_address = excluded.ip_address,
      username = excluded.username,
      password = excluded.password
  `);
  const insertMany = db.transaction((rows: StoredDevice[]) => {
    for (const row of rows) stmt.run(row);
  });
  insertMany(devices);
}

export function listDevices(db: Database.Database): StoredDevice[] {
  return db
    .prepare("select id, name, ip_address as ipAddress, username, password from devices")
    .all() as StoredDevice[];
}

export function insertPunchIfNew(
  db: Database.Database,
  punch: { deviceId: string; employeeNoString: string; punchedAt: string; rawEventId: string | null },
): boolean {
  const result = db
    .prepare(
      `insert or ignore into punches (device_id, employee_no_string, punched_at, raw_event_id)
       values (@deviceId, @employeeNoString, @punchedAt, @rawEventId)`,
    )
    .run(punch);
  return result.changes > 0;
}

export function unsyncedPunches(db: Database.Database): StoredPunch[] {
  const rows = db
    .prepare(
      `select id, device_id as deviceId, employee_no_string as employeeNoString, punched_at as punchedAt, synced
       from punches where synced = 0 order by punched_at asc`,
    )
    .all() as { id: number; deviceId: string; employeeNoString: string; punchedAt: string; synced: number }[];
  return rows.map((r) => ({ ...r, synced: Boolean(r.synced) }));
}

export function markSynced(db: Database.Database, ids: number[]): void {
  if (ids.length === 0) return;
  const stmt = db.prepare("update punches set synced = 1 where id = ?");
  const markMany = db.transaction((idList: number[]) => {
    for (const id of idList) stmt.run(id);
  });
  markMany(ids);
}

export function recentPunches(db: Database.Database, limit: number): StoredPunch[] {
  const rows = db
    .prepare(
      `select id, device_id as deviceId, employee_no_string as employeeNoString, punched_at as punchedAt, synced
       from punches order by punched_at desc limit ?`,
    )
    .all(limit) as { id: number; deviceId: string; employeeNoString: string; punchedAt: string; synced: number }[];
  return rows.map((r) => ({ ...r, synced: Boolean(r.synced) }));
}

export function lastPunchTime(db: Database.Database, deviceId: string): string | null {
  const row = db
    .prepare("select max(punched_at) as maxTime from punches where device_id = ?")
    .get(deviceId) as { maxTime: string | null };
  return row.maxTime;
}

export function pendingCount(db: Database.Database): number {
  const row = db.prepare("select count(*) as count from punches where synced = 0").get() as { count: number };
  return row.count;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd attendance-agent && npm test`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
cd attendance-agent && git add src/db.ts src/db.test.ts && git commit -m "feat: add local SQLite layer for the attendance agent"
```

---

### Task 11: Hikvision ISAPI client (`hikvision.ts`)

**Files:**
- Create: `attendance-agent/src/digestFetch.d.ts`
- Create: `attendance-agent/src/hikvision.ts`
- Test: `attendance-agent/src/hikvision.test.ts`

`digest-fetch` ships no TypeScript types, so the plan adds a small ambient declaration first.

- [ ] **Step 1: Write the ambient type declaration**

Create `attendance-agent/src/digestFetch.d.ts`:

```ts
declare module "digest-fetch" {
  export default class DigestFetch {
    constructor(user: string, password: string, options?: { algorithm?: string });
    fetch(url: string, options?: RequestInit): Promise<Response>;
  }
}
```

- [ ] **Step 2: Write the failing tests for the parser**

`fetchNewEvents` itself needs a live device to test meaningfully, so only the pure parsing logic (`parseAcsEventResponse`) is unit tested here — this is called out explicitly rather than silently skipped, and gets exercised for real in Task 16's manual verification.

Create `attendance-agent/src/hikvision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAcsEventResponse } from "./hikvision.js";

describe("parseAcsEventResponse", () => {
  it("extracts employee number and ISO punch time from a typical AcsEvent response", () => {
    const fixture = {
      AcsEvent: {
        searchID: "abc",
        responseStatusStrg: "OK",
        numOfMatches: 1,
        totalMatches: 1,
        InfoList: [
          {
            major: 5,
            minor: 75,
            time: "2026-08-10T08:03:12-04:00",
            employeeNoString: "42",
            name: "Juan Perez",
          },
        ],
      },
    };

    const punches = parseAcsEventResponse(fixture);

    expect(punches).toEqual([
      {
        employeeNoString: "42",
        punchedAt: new Date("2026-08-10T08:03:12-04:00").toISOString(),
        rawEventId: "42-2026-08-10T08:03:12-04:00",
      },
    ]);
  });

  it("skips entries with no employeeNoString (e.g. door-open events unrelated to a person)", () => {
    const fixture = {
      AcsEvent: {
        InfoList: [{ major: 5, minor: 38, time: "2026-08-10T08:00:00-04:00" }],
      },
    };

    expect(parseAcsEventResponse(fixture)).toEqual([]);
  });

  it("returns an empty array when InfoList is missing entirely (no events in range)", () => {
    expect(parseAcsEventResponse({ AcsEvent: { searchID: "abc", numOfMatches: 0 } })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd attendance-agent && npm test`
Expected: FAIL — `Cannot find module './hikvision.js'`

- [ ] **Step 4: Write `hikvision.ts`**

Create `attendance-agent/src/hikvision.ts`:

```ts
import DigestFetch from "digest-fetch";

interface AcsEventInfo {
  employeeNoString?: string;
  time?: string;
}

export interface RawPunch {
  employeeNoString: string;
  punchedAt: string;
  rawEventId: string;
}

export function parseAcsEventResponse(body: unknown): RawPunch[] {
  const infoList = (body as { AcsEvent?: { InfoList?: AcsEventInfo[] } })?.AcsEvent?.InfoList ?? [];
  return infoList
    .filter((entry): entry is Required<AcsEventInfo> => Boolean(entry.employeeNoString && entry.time))
    .map((entry) => ({
      employeeNoString: entry.employeeNoString,
      punchedAt: new Date(entry.time).toISOString(),
      rawEventId: `${entry.employeeNoString}-${entry.time}`,
    }));
}

export interface DeviceCredentials {
  ipAddress: string;
  username: string;
  password: string;
}

export async function fetchNewEvents(
  device: DeviceCredentials,
  startTime: Date,
  endTime: Date,
): Promise<RawPunch[]> {
  const client = new DigestFetch(device.username, device.password);
  const response = await client.fetch(`http://${device.ipAddress}/ISAPI/AccessControl/AcsEvent?format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      AcsEventCond: {
        searchID: crypto.randomUUID(),
        searchResultPosition: 0,
        maxResults: 200,
        major: 0,
        minor: 0,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hikvision device ${device.ipAddress} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  return parseAcsEventResponse(body);
}
```

Note for whoever runs Task 16's manual verification: the exact `InfoList` field names (`employeeNoString`, `time`) match Hikvision's documented ISAPI shape for `DS-K1T321EFWX` firmware `V3.9.3`, but this should be confirmed against one real response before trusting it in production — if the real device uses different field names, only `parseAcsEventResponse`'s field lookups need to change, not any calling code.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd attendance-agent && npm test`
Expected: PASS (3/3 new, 10/10 total)

- [ ] **Step 6: Commit**

```bash
cd attendance-agent && git add src/digestFetch.d.ts src/hikvision.ts src/hikvision.test.ts && git commit -m "feat: add Hikvision ISAPI client and AcsEvent parser"
```

---

### Task 12: Cloud API client (`cloudApi.ts`)

**Files:**
- Create: `attendance-agent/src/cloudApi.ts`
- Test: `attendance-agent/src/cloudApi.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `attendance-agent/src/cloudApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDevices, postPunches } from "./cloudApi.js";

describe("cloudApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchDevices sends the shared secret as a Bearer token and returns the device list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        devices: [
          { id: "d1", name: "Entrada", ip_address: "192.168.1.50", username: "admin", password: "secret" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const devices = await fetchDevices({ baseUrl: "https://example.com", secret: "shh" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/attendance/devices",
      expect.objectContaining({ headers: { Authorization: "Bearer shh" } }),
    );
    expect(devices).toEqual([
      { id: "d1", name: "Entrada", ip_address: "192.168.1.50", username: "admin", password: "secret" },
    ]);
  });

  it("fetchDevices throws when the cloud API responds with a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(fetchDevices({ baseUrl: "https://example.com", secret: "wrong" })).rejects.toThrow("HTTP 401");
  });

  it("postPunches sends the batch as JSON with the Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ synced: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await postPunches({ baseUrl: "https://example.com", secret: "shh" }, [
      { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/attendance/punches",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer shh", "Content-Type": "application/json" },
        body: JSON.stringify({
          punches: [{ device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" }],
        }),
      }),
    );
  });

  it("postPunches throws when the cloud API rejects the batch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(
      postPunches({ baseUrl: "https://example.com", secret: "wrong" }, [
        { device_id: "d1", employee_no_string: "42", punched_at: "2026-08-10T08:00:00.000Z" },
      ]),
    ).rejects.toThrow("HTTP 401");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd attendance-agent && npm test`
Expected: FAIL — `Cannot find module './cloudApi.js'`

- [ ] **Step 3: Write `cloudApi.ts`**

Create `attendance-agent/src/cloudApi.ts`:

```ts
export interface CloudDevice {
  id: string;
  name: string;
  ip_address: string;
  username: string;
  password: string;
}

export interface CloudConfig {
  baseUrl: string;
  secret: string;
}

export async function fetchDevices(config: CloudConfig): Promise<CloudDevice[]> {
  const response = await fetch(`${config.baseUrl}/api/attendance/devices`, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch devices: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { devices: CloudDevice[] };
  return body.devices;
}

export interface OutgoingPunch {
  device_id: string;
  employee_no_string: string;
  punched_at: string;
}

export async function postPunches(config: CloudConfig, punches: OutgoingPunch[]): Promise<void> {
  const response = await fetch(`${config.baseUrl}/api/attendance/punches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ punches }),
  });
  if (!response.ok) {
    throw new Error(`Failed to post punches: HTTP ${response.status}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd attendance-agent && npm test`
Expected: PASS (4/4 new, 14/14 total)

- [ ] **Step 5: Commit**

```bash
cd attendance-agent && git add src/cloudApi.ts src/cloudApi.test.ts && git commit -m "feat: add cloud API client for the attendance agent"
```

---

### Task 13: Console monitor (`monitor.ts`)

**Files:**
- Create: `attendance-agent/src/monitor.ts`
- Test: `attendance-agent/src/monitor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `attendance-agent/src/monitor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderMonitor } from "./monitor.js";

describe("renderMonitor", () => {
  it("shows a placeholder line when there are no captured punches yet", () => {
    const output = renderMonitor({ recent: [], pendingCount: 0, deviceCount: 2, lastError: null });
    expect(output).toContain("Dispositivos registrados: 2");
    expect(output).toContain("(todavía no se ha capturado ningún ponche)");
  });

  it("marks a synced punch with a check and a pending one with an ellipsis", () => {
    const output = renderMonitor({
      recent: [
        { id: 1, deviceId: "d1", employeeNoString: "42", punchedAt: "2026-08-10T08:00:00.000Z", synced: true },
        { id: 2, deviceId: "d1", employeeNoString: "43", punchedAt: "2026-08-10T08:05:00.000Z", synced: false },
      ],
      pendingCount: 1,
      deviceCount: 1,
      lastError: null,
    });
    expect(output).toContain("[✓] 2026-08-10T08:00:00.000Z  empleado 42  (dispositivo d1)");
    expect(output).toContain("[…] 2026-08-10T08:05:00.000Z  empleado 43  (dispositivo d1)");
  });

  it("shows the last error when present", () => {
    const output = renderMonitor({ recent: [], pendingCount: 0, deviceCount: 0, lastError: "device unreachable" });
    expect(output).toContain("Último error: device unreachable");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd attendance-agent && npm test`
Expected: FAIL — `Cannot find module './monitor.js'`

- [ ] **Step 3: Write `monitor.ts`**

Create `attendance-agent/src/monitor.ts`:

```ts
import type { StoredPunch } from "./db.js";

export interface MonitorState {
  recent: StoredPunch[];
  pendingCount: number;
  deviceCount: number;
  lastError: string | null;
}

export function renderMonitor(state: MonitorState): string {
  const lines: string[] = [];
  lines.push("=== Agente de Asistencia - Sanchez Business & Corp ===");
  lines.push(`Dispositivos registrados: ${state.deviceCount}`);
  lines.push(`Ponches pendientes de sincronizar: ${state.pendingCount}`);
  if (state.lastError) {
    lines.push(`Último error: ${state.lastError}`);
  }
  lines.push("");
  lines.push("Últimos ponches:");
  if (state.recent.length === 0) {
    lines.push("  (todavía no se ha capturado ningún ponche)");
  } else {
    for (const punch of state.recent) {
      const mark = punch.synced ? "✓" : "…";
      lines.push(`  [${mark}] ${punch.punchedAt}  empleado ${punch.employeeNoString}  (dispositivo ${punch.deviceId})`);
    }
  }
  return lines.join("\n");
}

export function draw(output: string): void {
  console.clear();
  console.log(output);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd attendance-agent && npm test`
Expected: PASS (3/3 new, 17/17 total)

- [ ] **Step 5: Commit**

```bash
cd attendance-agent && git add src/monitor.ts src/monitor.test.ts && git commit -m "feat: add console monitor rendering for the attendance agent"
```

---

### Task 14: Orchestration entry point (`index.ts`)

**Files:**
- Create: `attendance-agent/src/index.ts`

No unit test for this task — it is a thin wiring/orchestration entry point (three `setInterval` loops calling the already-tested modules), the same way this repo's own `page.tsx`/route-wiring files aren't unit tested. It is exercised by Task 16's manual end-to-end verification.

- [ ] **Step 1: Write `index.ts`**

Create `attendance-agent/src/index.ts`:

```ts
import "dotenv/config";
import {
  openDb,
  upsertDevices,
  listDevices,
  insertPunchIfNew,
  unsyncedPunches,
  markSynced,
  recentPunches,
  pendingCount,
  lastPunchTime,
} from "./db.js";
import { fetchDevices, postPunches } from "./cloudApi.js";
import { fetchNewEvents } from "./hikvision.js";
import { renderMonitor, draw } from "./monitor.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const cloudConfig = {
  baseUrl: requireEnv("CLOUD_API_BASE_URL"),
  secret: requireEnv("ATTENDANCE_AGENT_SECRET"),
};

const db = openDb("attendance-agent.db");
let lastError: string | null = null;

async function refreshDevices(): Promise<void> {
  try {
    const devices = await fetchDevices(cloudConfig);
    upsertDevices(
      db,
      devices.map((d) => ({
        id: d.id,
        name: d.name,
        ipAddress: d.ip_address,
        username: d.username,
        password: d.password,
      })),
    );
    lastError = null;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

async function pollDevices(): Promise<void> {
  for (const device of listDevices(db)) {
    try {
      const since = lastPunchTime(db, device.id);
      const startTime = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endTime = new Date();
      const events = await fetchNewEvents(device, startTime, endTime);
      for (const event of events) {
        insertPunchIfNew(db, {
          deviceId: device.id,
          employeeNoString: event.employeeNoString,
          punchedAt: event.punchedAt,
          rawEventId: event.rawEventId,
        });
      }
    } catch (err) {
      lastError = `${device.name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

async function syncPunches(): Promise<void> {
  const pending = unsyncedPunches(db);
  if (pending.length === 0) return;
  try {
    await postPunches(
      cloudConfig,
      pending.map((p) => ({
        device_id: p.deviceId,
        employee_no_string: p.employeeNoString,
        punched_at: p.punchedAt,
      })),
    );
    markSynced(
      db,
      pending.map((p) => p.id),
    );
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

function renderTick(): void {
  draw(
    renderMonitor({
      recent: recentPunches(db, 20),
      pendingCount: pendingCount(db),
      deviceCount: listDevices(db).length,
      lastError,
    }),
  );
}

async function main(): Promise<void> {
  await refreshDevices();
  renderTick();

  setInterval(() => void refreshDevices().then(renderTick), 5 * 60 * 1000);
  setInterval(() => void pollDevices().then(renderTick), 20 * 1000);
  setInterval(() => void syncPunches().then(renderTick), 25 * 1000);
}

main();
```

- [ ] **Step 2: Verify it builds**

Run: `cd attendance-agent && npm run build`
Expected: no TypeScript errors, `dist/index.js` produced.

- [ ] **Step 3: Commit**

```bash
cd attendance-agent && git add src/index.ts && git commit -m "feat: wire up the attendance agent's polling, sync, and monitor loops"
```

---

### Task 15: Windows Startup installer + README

**Files:**
- Create: `attendance-agent/src/installStartup.ts`
- Create: `attendance-agent/README.md`

- [ ] **Step 1: Write the installer**

Create `attendance-agent/src/installStartup.ts`:

```ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const startupDir = join(
  homedir(),
  "AppData",
  "Roaming",
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup",
);

const projectDir = process.cwd();
const launcherPath = join(startupDir, "attendance-agent.cmd");
const launcherContents = `@echo off\r\ncd /d "${projectDir}"\r\nnode "${join(projectDir, "dist", "index.js")}"\r\n`;

mkdirSync(startupDir, { recursive: true });
writeFileSync(launcherPath, launcherContents);
console.log(`Instalado: ${launcherPath}`);
console.log("El agente se iniciará automáticamente la próxima vez que Windows inicie sesión.");
```

- [ ] **Step 2: Verify it builds**

Run: `cd attendance-agent && npm run build`
Expected: no TypeScript errors, `dist/installStartup.js` produced alongside `dist/index.js`.

- [ ] **Step 3: Write the README**

Create `attendance-agent/README.md`:

```markdown
# Attendance Agent

Runs on a Windows PC on the same network as the Hikvision terminal(s). Polls
each registered terminal every ~20 seconds, stores captures in a local SQLite
database (`attendance-agent.db`, created next to this folder), and syncs
unsynced rows to the GenteBusiness cloud API every ~25 seconds. Shows a live
console view of recent captures.

## Setup (one time, on the office PC)

1. Install Node.js 20 or newer.
2. Copy this whole `attendance-agent` folder onto the PC.
3. Open a terminal in this folder and run:
   ```
   npm install
   npm run build
   ```
4. Copy `.env.example` to `.env` and fill in:
   - `ATTENDANCE_AGENT_SECRET` — must match the value set in the Next.js app's
     `ATTENDANCE_AGENT_SECRET` environment variable.
   - `CLOUD_API_BASE_URL` — the production URL, e.g. `https://gente-business.vercel.app`.
5. Register each Hikvision terminal (name, IP, username, password) on the
   "Ponchadores" admin page in GenteBusiness. The agent picks these up
   automatically within 5 minutes of starting, no restart needed.
6. Test it manually first: `npm start`. You should see the console monitor
   appear and update. Press Ctrl+C to stop.
7. Once it's working, run `npm run install-startup` to make it launch
   automatically the next time Windows starts. To test that immediately
   without rebooting, double-click the file it just created (path is printed
   to the console).

## Troubleshooting

- **`npm install` fails on `better-sqlite3`**: this package ships prebuilt
  binaries for Windows x64, so this should be rare. If it happens, install
  "Desktop development with C++" via the Visual Studio Build Tools installer
  and re-run `npm install`.
- **Console shows "Último error: ..."**: read the message — it names either
  a specific device (wrong IP/credentials/unreachable) or the cloud API
  (check `ATTENDANCE_AGENT_SECRET` matches on both sides). The agent keeps
  retrying automatically; nothing needs to be restarted.
```

- [ ] **Step 4: Commit**

```bash
cd attendance-agent && git add src/installStartup.ts README.md && git commit -m "feat: add Windows Startup installer and setup README"
```

---

### Task 16: End-to-end manual verification (requires the real device)

This can't be automated — it needs the actual `DS-K1T321EFWX` terminal reachable on the network. Not a placeholder: these are the real acceptance steps for the whole feature, to run once Part A is deployed and a device is registered.

- [ ] **Step 1: Confirm the raw ISAPI shape**

From a machine on the same network as the terminal, using the device's real IP/username/password:

```bash
curl --digest -u <username>:<password> -X POST "http://<device-ip>/ISAPI/AccessControl/AcsEvent?format=json" \
  -H "Content-Type: application/json" \
  -d '{"AcsEventCond":{"searchID":"test-1","searchResultPosition":0,"maxResults":10,"major":0,"minor":0,"startTime":"2026-08-10T00:00:00-04:00","endTime":"2026-08-10T23:59:59-04:00"}}'
```

Compare the real `InfoList` entries' field names against what `parseAcsEventResponse` (Task 11) expects (`employeeNoString`, `time`). If they differ, update `hikvision.ts`'s `AcsEventInfo` interface and mapping to match — no other file needs to change.

- [ ] **Step 2: Register the real device and run the agent**

On the office PC: register the real device on the "Ponchadores" page, set up `.env` per the README, run `npm start`. Have someone punch in on the terminal. Confirm within ~20-45 seconds: the console monitor shows the new punch, first as pending (`…`), then as synced (`✓`).

- [ ] **Step 3: Confirm it lands in Supabase**

In the Supabase Studio table editor, confirm a new row appears in `time_clock_punches` with the correct `employee_no_string` and `punched_at`, and `contact_id` set if that employee's contact has a matching `hikvision_employee_no` (Task 6).

- [ ] **Step 4: Confirm offline resilience**

Disconnect the office PC from the internet (keep it on the same LAN as the device), punch in again, confirm the console shows the new punch as pending and it keeps retrying (no crash). Reconnect the internet, confirm it flips to synced within ~25 seconds without restarting the agent.

- [ ] **Step 5: Confirm auto-start**

Reboot the office PC (or log out and back in), confirm the agent's console window opens automatically with no manual action.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-10-attendance-hikvision-agent.md`. Two execution options:

1. **Subagent-Driven (recommended)** - fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
