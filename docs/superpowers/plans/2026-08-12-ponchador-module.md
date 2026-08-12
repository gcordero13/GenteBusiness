# Ponchador Module (Personal Attendance Log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-gated `/ponchador` page showing the viewer's own current-month attendance log (a day-by-day entrada/salida table) plus their average arrival time, reachable from a new sidebar entry.

**Architecture:** A new RLS policy lets each authenticated user read their own rows from `time_clock_punches` (no admin client needed, unlike the home page's company-wide Top 5). A new pure function in `src/lib/attendance.ts`, `buildDailyAttendanceRows`, derives each day's entrada/salida from raw punches; the existing `deriveDailyArrivals` is refactored to reuse it instead of duplicating the "earliest punch before noon" rule. A new `ponchador` permission module gates a new sidebar entry and page.

**Tech Stack:** Next.js Server Components, Supabase (RLS + the session-scoped client - no admin client in this feature), TypeScript, Vitest, Tailwind CSS, lucide-react icons. This machine is missing `node.exe` - use `bun run test`/`bun run <script>` and `bunx tsc --noEmit`, never `npm`/`npx`.

**Spec:** `docs/superpowers/specs/2026-08-12-ponchador-module-design.md`.

---

## File Structure

- **Modify** `src/lib/attendance.ts` - add `buildDailyAttendanceRows` (new shared primitive); refactor `deriveDailyArrivals` to delegate to it.
- **Modify** `src/lib/attendance.test.ts` - new tests for `buildDailyAttendanceRows`.
- **Create** `supabase/migrations/20260812100000_ponchador_module_and_punches_rls.sql` - registers the `ponchador` permission module and adds the `time_clock_punches_select_own` RLS policy.
- **Create** `src/test/integration/timeClockPunchesRls.test.ts` - verifies the new RLS policy's isolation.
- **Create** `src/app/(app)/ponchador/PonchadorDashboard.tsx` - presentational component (summary card + table).
- **Create** `src/app/(app)/ponchador/page.tsx` - data fetching, permission gate, renders `PonchadorDashboard`.
- **Modify** `src/app/(app)/Sidebar.tsx` - new `canViewPonchador` prop, new sidebar entry.
- **Modify** `src/app/(app)/layout.tsx` - passes the new permission flag to `AppShell`/`Sidebar`.

---

## Task 1: `attendance.ts` — `buildDailyAttendanceRows` and the `deriveDailyArrivals` refactor

**Files:**
- Modify: `src/lib/attendance.ts:30-54`
- Modify: `src/lib/attendance.test.ts`

Current code at `src/lib/attendance.ts:30-54`:

```typescript
// A punch at or after noon can't be a morning arrival - it's someone's exit
// punch, a lunch-return punch, or (in practice) a stray device-test punch on
// a day with no real check-in. Only punches before this cutoff are eligible
// to be a day's "arrival."
const ARRIVAL_CUTOFF_MINUTES = 12 * 60;

// Groups raw punch timestamps by business-timezone calendar day and keeps
// only the earliest BEFORE-NOON punch per day - that day's "arrival." A day
// whose only punches are at/after noon has no arrival at all and is left out
// of the result entirely, the same as a day with zero punches - a lone
// afternoon punch is not evidence of when someone arrived that morning.
export function deriveDailyArrivals(punchedAtIsoTimestamps: string[]): DailyArrival[] {
  const earliestByDate = new Map<string, number>();
  for (const iso of punchedAtIsoTimestamps) {
    const { dateIso, minutesSinceMidnight } = toBusinessTimeParts(iso);
    if (minutesSinceMidnight >= ARRIVAL_CUTOFF_MINUTES) continue;
    const existing = earliestByDate.get(dateIso);
    if (existing === undefined || minutesSinceMidnight < existing) {
      earliestByDate.set(dateIso, minutesSinceMidnight);
    }
  }
  return Array.from(earliestByDate.entries())
    .map(([dateIso, arrivalMinutes]) => ({ dateIso, arrivalMinutes }))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
```

- [ ] **Step 1: Write the failing tests**

Change the top import line in `src/lib/attendance.test.ts` from:

```typescript
import {
  toBusinessTimeParts,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
} from "./attendance";
```

to:

```typescript
import {
  toBusinessTimeParts,
  buildDailyAttendanceRows,
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  scheduleTimeToMinutes,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
} from "./attendance";
```

Then insert this new `describe` block immediately before the existing `describe("deriveDailyArrivals", ...)` block:

```typescript
describe("buildDailyAttendanceRows", () => {
  it("reports only an arrival for a day with a single morning punch", () => {
    const result = buildDailyAttendanceRows(["2026-01-15T12:30:00.000Z"]); // 08:30 local
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30, exitMinutes: null }]);
  });

  it("reports both an arrival and an exit for a day with a morning and an afternoon punch", () => {
    const result = buildDailyAttendanceRows([
      "2026-01-15T12:30:00.000Z", // 08:30 local
      "2026-01-15T21:00:00.000Z", // 17:00 local
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30, exitMinutes: 17 * 60 }]);
  });

  it("reports only an exit (no arrival) for a day with a single afternoon-only punch", () => {
    const result = buildDailyAttendanceRows(["2026-01-15T21:00:00.000Z"]); // 17:00 local
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: null, exitMinutes: 17 * 60 }]);
  });

  it("reports the later of two afternoon-only punches as the exit, with no arrival", () => {
    const result = buildDailyAttendanceRows([
      "2026-01-15T19:00:00.000Z", // 15:00 local
      "2026-01-15T21:00:00.000Z", // 17:00 local
    ]);
    expect(result).toEqual([{ dateIso: "2026-01-15", arrivalMinutes: null, exitMinutes: 17 * 60 }]);
  });

  it("returns one row per distinct day, sorted by date ascending", () => {
    const result = buildDailyAttendanceRows([
      "2026-01-16T12:00:00.000Z", // 08:00 local, the 16th
      "2026-01-15T12:30:00.000Z", // 08:30 local, the 15th
    ]);
    expect(result).toEqual([
      { dateIso: "2026-01-15", arrivalMinutes: 8 * 60 + 30, exitMinutes: null },
      { dateIso: "2026-01-16", arrivalMinutes: 8 * 60, exitMinutes: null },
    ]);
  });

  it("returns an empty array for no punches", () => {
    expect(buildDailyAttendanceRows([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- attendance.test.ts`
Expected: FAIL - `buildDailyAttendanceRows` is not exported yet.

- [ ] **Step 3: Replace the implementation**

Replace the current `src/lib/attendance.ts:30-54` block (shown above, from the `ARRIVAL_CUTOFF_MINUTES` comment through the end of `deriveDailyArrivals`) with:

```typescript
// A punch at or after noon can't be a morning arrival - it's someone's exit
// punch, a lunch-return punch, or (in practice) a stray device-test punch on
// a day with no real check-in. Only punches before this cutoff are eligible
// to be a day's "arrival."
const ARRIVAL_CUTOFF_MINUTES = 12 * 60;

export interface DailyAttendanceRow {
  dateIso: string; // "YYYY-MM-DD", business-timezone calendar day
  arrivalMinutes: number | null; // earliest punch before noon that day, or null
  exitMinutes: number | null; // latest punch that day, or null - see rule below
}

// Groups raw punch timestamps by business-timezone calendar day. For each day
// that has at least one punch:
// - arrivalMinutes is the earliest punch before noon that day, or null if
//   every punch that day was at/after noon - a lone afternoon punch is not
//   evidence of when someone arrived that morning.
// - exitMinutes is the day's latest punch, UNLESS that day has exactly one
//   punch and it's already the arrival - a single morning punch isn't shown
//   as both an entrada and a salida, since there's no second event to
//   report. A day whose only punch is in the afternoon has no arrival, so
//   that one punch is reported as exitMinutes instead - there's no arrival
//   for it to collide with.
export function buildDailyAttendanceRows(punchedAtIsoTimestamps: string[]): DailyAttendanceRow[] {
  const minutesByDate = new Map<string, number[]>();
  for (const iso of punchedAtIsoTimestamps) {
    const { dateIso, minutesSinceMidnight } = toBusinessTimeParts(iso);
    const list = minutesByDate.get(dateIso) ?? [];
    list.push(minutesSinceMidnight);
    minutesByDate.set(dateIso, list);
  }

  const rows: DailyAttendanceRow[] = [];
  for (const [dateIso, minutes] of minutesByDate.entries()) {
    const sorted = [...minutes].sort((a, b) => a - b);
    const morningPunches = sorted.filter((m) => m < ARRIVAL_CUTOFF_MINUTES);
    const arrivalMinutes = morningPunches.length > 0 ? morningPunches[0] : null;
    const latest = sorted[sorted.length - 1];
    const exitMinutes = sorted.length > 1 || arrivalMinutes === null ? latest : null;
    rows.push({ dateIso, arrivalMinutes, exitMinutes });
  }
  return rows.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

// Thin filter over buildDailyAttendanceRows - kept as its own function since
// most callers (the monthly average, the schedule comparison) only care
// about arrivals and shouldn't need to know exitMinutes exists at all.
export function deriveDailyArrivals(punchedAtIsoTimestamps: string[]): DailyArrival[] {
  return buildDailyAttendanceRows(punchedAtIsoTimestamps)
    .filter((row): row is DailyAttendanceRow & { arrivalMinutes: number } => row.arrivalMinutes !== null)
    .map((row) => ({ dateIso: row.dateIso, arrivalMinutes: row.arrivalMinutes }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- attendance.test.ts`
Expected: PASS (48 tests - the existing 42, plus 6 new `buildDailyAttendanceRows` tests; the existing 6 `deriveDailyArrivals` tests must still pass unchanged, since the refactor preserves its exact input/output behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance.ts src/lib/attendance.test.ts
git commit -m "refactor: extract buildDailyAttendanceRows, derive deriveDailyArrivals from it"
```

---

## Task 2: Migration — `ponchador` module and the `time_clock_punches_select_own` RLS policy

**Files:**
- Create: `supabase/migrations/20260812100000_ponchador_module_and_punches_rls.sql`

This task is purely additive: a new RLS SELECT policy on an existing table, and one new row in `modules` plus one `role_profile_permissions` row per existing role profile. It does not touch anything the currently-deployed code reads or depends on.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260812100000_ponchador_module_and_punches_rls.sql`:

```sql
-- Lets a user read their own time_clock_punches rows (matched via their
-- contacts row's email, the same way app_users links to contacts elsewhere
-- in this codebase) without needing the service-role client. This is
-- intentionally narrower than "any authenticated user can read" - a user can
-- never see another contact's punches through this policy. It does not
-- depend on (and is not gated by) the ponchador module's can_view flag below
-- - that check happens in the /ponchador page itself, the same way the home
-- page's attendance cards are gated by hikvision_employee_no in app code
-- rather than in RLS.
create policy "time_clock_punches_select_own" on public.time_clock_punches
for select using (
  contact_id in (
    select id from public.contacts
    where email = (select email from public.app_users where id = auth.uid())
  )
);

insert into public.modules (key, label) values ('ponchador', 'Ponchador');

insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, (rp.name = 'Super Admin'), false, false, false, false, false, false
from public.role_profiles rp
cross join public.modules m
where m.key = 'ponchador';
```

- [ ] **Step 2: STOP - human confirmation required**

**STOP here.** This migration file is committed as code in this step, but it must not be applied automatically. Tell the human: "This is the final migration for the Ponchador module - please paste the contents of `supabase/migrations/20260812100000_ponchador_module_and_punches_rls.sql` into the Supabase SQL Editor and run it now." Do not proceed to Task 3 (which requires this policy to exist) until the human explicitly confirms it has been applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812100000_ponchador_module_and_punches_rls.sql
git commit -m "feat: add ponchador permission module and time_clock_punches self-select RLS policy"
```

---

## Task 3: RLS integration test for `time_clock_punches_select_own`

**Files:**
- Create: `src/test/integration/timeClockPunchesRls.test.ts`

**Do not start this task until Task 2's migration has been confirmed applied to the live database** - this test exercises the real policy.

- [ ] **Step 1: Write the test**

Create `src/test/integration/timeClockPunchesRls.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("time_clock_punches RLS - select own", () => {
  let viewer: TestUser | undefined;
  let ownContactId: string | undefined;
  let otherContactId: string | undefined;
  let deviceId: string | undefined;

  afterEach(async () => {
    const admin = createAdminClient();
    if (deviceId) await admin.from("time_clock_punches").delete().eq("device_id", deviceId);
    if (deviceId) await admin.from("time_clock_devices").delete().eq("id", deviceId);
    if (ownContactId) await admin.from("contacts").delete().eq("id", ownContactId);
    if (otherContactId) await admin.from("contacts").delete().eq("id", otherContactId);
    if (viewer) await deleteTestUser(viewer.id);
    viewer = undefined;
    ownContactId = undefined;
    otherContactId = undefined;
    deviceId = undefined;
  });

  it("lets a user select their own contact's punches but not another contact's", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: device } = await admin
      .from("time_clock_devices")
      .insert({ name: "Test Device", ip_address: "192.168.1.1", username: "admin", password: "secret" })
      .select()
      .single();
    deviceId = device!.id;

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({
        first_name: "Own",
        last_name: "Contact",
        email: viewer.email,
        hikvision_employee_no: `own-${viewer.id}`,
      })
      .select()
      .single();
    ownContactId = ownContact!.id;

    const { data: otherContact } = await admin
      .from("contacts")
      .insert({
        first_name: "Other",
        last_name: "Contact",
        hikvision_employee_no: `other-${viewer.id}`,
      })
      .select()
      .single();
    otherContactId = otherContact!.id;

    await admin.from("time_clock_punches").insert([
      {
        device_id: deviceId,
        employee_no_string: `own-${viewer.id}`,
        contact_id: ownContactId,
        punched_at: "2026-08-11T12:00:00.000Z",
      },
      {
        device_id: deviceId,
        employee_no_string: `other-${viewer.id}`,
        contact_id: otherContactId,
        punched_at: "2026-08-11T13:00:00.000Z",
      },
    ]);

    const { data, error } = await viewer.client
      .from("time_clock_punches")
      .select("contact_id")
      .eq("device_id", deviceId);

    expect(error).toBeNull();
    expect(data?.map((d) => d.contact_id)).toEqual([ownContactId]);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `bun run test -- timeClockPunchesRls.test.ts`
Expected: PASS (1 test). If it fails with a permissions/policy-related error, the migration from Task 2 likely hasn't actually been applied yet - stop and confirm with the human before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/timeClockPunchesRls.test.ts
git commit -m "test: add RLS integration test for time_clock_punches_select_own"
```

---

## Task 4: `PonchadorDashboard.tsx` component

**Files:**
- Create: `src/app/(app)/ponchador/PonchadorDashboard.tsx`

Pure presentational component - no data fetching (that's Task 6). No test file, matching this codebase's existing convention of no component-level tests (e.g. `AttendanceSummaryCards.tsx`, `MyProfileCard.tsx` are also untested at this layer).

- [ ] **Step 1: Write the component**

Create `src/app/(app)/ponchador/PonchadorDashboard.tsx`:

```tsx
import { CalendarClock, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface PonchadorRow {
  dateIso: string;
  dateLabel: string;
  arrivalLabel: string | null;
  exitLabel: string | null;
}

export function PonchadorDashboard({
  averageArrivalLabel,
  rows,
}: {
  averageArrivalLabel: string | null;
  rows: PonchadorRow[];
}) {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <TrendingUp className="size-4 text-[#04B1AF]" />
          Promedio de llegada este mes
        </div>
        <p className="mt-2 text-2xl font-bold">{averageArrivalLabel ?? "Sin datos este mes"}</p>
      </div>

      <div className="rounded-2xl border p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4 text-muted-foreground" />
          Registro del mes
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay ponchadas registradas este mes.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.dateIso}>
                  <TableCell>{row.dateLabel}</TableCell>
                  <TableCell>{row.arrivalLabel ?? "—"}</TableCell>
                  <TableCell>{row.exitLabel ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors. (Not imported anywhere yet - a real usage check happens in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/PonchadorDashboard.tsx"
git commit -m "feat: add the PonchadorDashboard presentational component"
```

---

## Task 5: Sidebar and layout wiring

**Files:**
- Modify: `src/app/(app)/Sidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add the `CalendarClock` icon import**

In `src/app/(app)/Sidebar.tsx`, change the lucide-react import from:

```typescript
import {
  BookUser,
  Building2,
  Clock,
  FileSignature,
  Fingerprint,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Palmtree,
  PartyPopper,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";
```

to:

```typescript
import {
  BookUser,
  Building2,
  CalendarClock,
  Clock,
  FileSignature,
  Fingerprint,
  LogOut,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Palmtree,
  PartyPopper,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";
```

- [ ] **Step 2: Add the `canViewPonchador` prop**

In the same file, change:

```typescript
export function Sidebar({
  email,
  canViewContacts,
  canManageUsers,
```

to:

```typescript
export function Sidebar({
  email,
  canViewContacts,
  canViewPonchador,
  canManageUsers,
```

and change:

```typescript
}: {
  email?: string;
  canViewContacts: boolean;
  canManageUsers: boolean;
```

to:

```typescript
}: {
  email?: string;
  canViewContacts: boolean;
  canViewPonchador: boolean;
  canManageUsers: boolean;
```

- [ ] **Step 3: Add the sidebar entry**

In the same file, change:

```typescript
  const mainLinks: NavLink[] = [
    { href: "/my-profile", label: "Mi perfil", icon: UserCircle },
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
```

to:

```typescript
  const mainLinks: NavLink[] = [
    { href: "/my-profile", label: "Mi perfil", icon: UserCircle },
    ...(canViewPonchador ? [{ href: "/ponchador", label: "Ponchador", icon: CalendarClock }] : []),
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
```

- [ ] **Step 4: Pass the new flag from the layout**

In `src/app/(app)/layout.tsx`, change:

```tsx
    <AppShell
      email={user?.email}
      canViewContacts={Boolean(permissions.get("contacts")?.can_view)}
      canManageUsers={Boolean(permissions.get("users")?.can_manage)}
```

to:

```tsx
    <AppShell
      email={user?.email}
      canViewContacts={Boolean(permissions.get("contacts")?.can_view)}
      canViewPonchador={Boolean(permissions.get("ponchador")?.can_view)}
      canManageUsers={Boolean(permissions.get("users")?.can_manage)}
```

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/Sidebar.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: add the Ponchador sidebar entry, gated on the new permission"
```

---

## Task 6: `src/app/(app)/ponchador/page.tsx`

**Files:**
- Create: `src/app/(app)/ponchador/page.tsx`

This is the integration task tying Tasks 1, 3, 4, and 5 together. It requires Task 2's migration to already be applied (the page queries `time_clock_punches` with the normal session client, relying on the RLS policy).

- [ ] **Step 1: Write the page**

Create `src/app/(app)/ponchador/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessToday, formatMonthDay } from "@/lib/contacts";
import {
  buildDailyAttendanceRows,
  averageArrivalMinutes,
  formatArrivalTime,
  type DailyArrival,
} from "@/lib/attendance";
import { PonchadorDashboard, type PonchadorRow } from "./PonchadorDashboard";

export default async function PonchadorPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "ponchador",
  });
  if (!flagsRows?.[0]?.can_view) {
    redirect("/");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myContact } = await supabase
    .from("contacts")
    .select("hikvision_employee_no")
    .eq("email", user!.email!)
    .maybeSingle();

  if (!myContact?.hikvision_employee_no) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
        <p className="text-sm text-muted-foreground">No tienes código de ponchador asignado.</p>
      </div>
    );
  }

  const today = getBusinessToday();
  const todayIso = today.toISOString().slice(0, 10);
  const monthStartIso = `${todayIso.slice(0, 7)}-01`;
  const windowStartIso = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

  const { data: punches } = await supabase
    .from("time_clock_punches")
    .select("punched_at")
    .gte("punched_at", windowStartIso);

  const allRows = buildDailyAttendanceRows((punches ?? []).map((p) => p.punched_at));
  const monthlyRows = allRows.filter((r) => r.dateIso >= monthStartIso);

  const monthlyArrivals: DailyArrival[] = monthlyRows
    .filter((r): r is typeof r & { arrivalMinutes: number } => r.arrivalMinutes !== null)
    .map((r) => ({ dateIso: r.dateIso, arrivalMinutes: r.arrivalMinutes }));
  const avgArrivalMinutes = averageArrivalMinutes(monthlyArrivals);

  const rows: PonchadorRow[] = monthlyRows.map((r) => ({
    dateIso: r.dateIso,
    dateLabel: formatMonthDay(r.dateIso),
    arrivalLabel: r.arrivalMinutes === null ? null : formatArrivalTime(r.arrivalMinutes),
    exitLabel: r.exitMinutes === null ? null : formatArrivalTime(r.exitMinutes),
  }));

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Ponchador</h1>
      <PonchadorDashboard
        averageArrivalLabel={avgArrivalMinutes === null ? null : formatArrivalTime(avgArrivalMinutes)}
        rows={rows}
      />
    </div>
  );
}
```

Note: the `time_clock_punches` query has no `employee_no_string`/`contact_id` filter at all - the `time_clock_punches_select_own` RLS policy from Task 2 already restricts the result set to the viewer's own rows, so nothing else is needed to scope it. This is also why this page reads `hikvision_employee_no` only to decide whether to show the empty state, not to filter the punches query itself.

- [ ] **Step 2: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bun run test`
Expected: all tests pass (aside from any pre-existing, unrelated Supabase-auth rate-limit flakiness - if a failure's message is exactly "Request rate limit reached" in a file this plan didn't touch, it's not a regression; re-run to confirm).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ponchador/page.tsx"
git commit -m "feat: add the /ponchador page - personal monthly attendance log"
```

---

## Self-Review Notes

- **Spec coverage:** Current-month-only scope → Task 6's `monthStartIso` filter, no month picker anywhere. Personal-only permission model → Task 2's RLS policy (self-only) + Task 6's in-page `can_view` redirect (the two together, as the spec's "Data Access" section explicitly calls out as two separate gates). Average-arrival-only summary metric → `PonchadorDashboard`'s single summary card (Task 4), no salida-average/hours-worked/on-time-count added. Entrada/salida table → `buildDailyAttendanceRows` (Task 1) + the table in `PonchadorDashboard` (Task 4). Sidebar entry with a distinct icon from the admin "Ponchadores" page → Task 5's `CalendarClock` (vs. the existing `Fingerprint` on `/attendance-devices`). "No código asignado" empty state → Task 6. RLS isolation test → Task 3.
- **Placeholder scan:** none found - every step has complete, concrete code.
- **Type consistency:** `DailyAttendanceRow` (Task 1) has `{dateIso, arrivalMinutes: number|null, exitMinutes: number|null}` and Task 6 destructures exactly those three fields when building `PonchadorRow`. `PonchadorRow` (Task 4) has `{dateIso, dateLabel, arrivalLabel: string|null, exitLabel: string|null}` and Task 6 constructs exactly that shape. `averageArrivalMinutes` and `formatArrivalTime` (both pre-existing, unchanged) are imported and called with matching signatures in Task 6.
- **No new migration risk:** Task 2's migration is purely additive (a new SELECT policy plus two new table rows) - it doesn't alter or drop anything, so there's no destructive/STOP-twice concern like the Horarios migration had.
