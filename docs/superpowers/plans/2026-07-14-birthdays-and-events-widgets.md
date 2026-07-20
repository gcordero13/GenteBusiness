# Birthdays Card Redesign + Company Events/Holidays Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the birthdays widget to the bottom of `/contacts`, redesign it as an animated card with an icon and the actual birthday date per person, and add a second, separate card next to it showing upcoming company activities/holidays — a brand-new admin-managed list (new table + admin CRUD page, same pattern as Companies/Departments).

**Architecture:** New `company_events` table (name + date), RLS mirroring `companies`/`departments` exactly (any authenticated user can read, only `can_manage_platform` can write) — since the migration must be applied via the Supabase dashboard SQL Editor (the CLI is still not linked on this machine, same situation as every other migration in this project). A new admin page `/activities` follows the established Companies/Departments table+modal pattern exactly. On `/contacts`, a new `formatMonthDay` pure helper (in `src/lib/contacts.ts`, TDD like the other date helpers there) formats both birthdays and event dates as "14 de julio". Both widgets move to the bottom of the page, side by side, using `tw-animate-css` (already imported in `globals.css`, already used by `dialog.tsx`) for a tasteful entrance animation — not a continuous/distracting one.

**Tech Stack:** Next.js (App Router), Supabase (new table + RLS), Tailwind CSS + `tw-animate-css` (already a dependency), `lucide-react` (already a dependency), Vitest.

**Related spec:** informal — agreed inline during brainstorming (2026-07-14): admin-managed activities/holidays (not a fixed Mexican-holidays list), redesigned birthdays card with date + icon + animation, moved to the bottom of the page.

---

### Task 1: `company_events` table + RLS (migration applied manually, same pattern as every prior migration in this project)

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_company_events.sql`
- Create: `src/test/integration/companyEventsRls.test.ts`

- [ ] **Step 1: Write the failing RLS test**

`src/test/integration/companyEventsRls.test.ts`:
```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("company_events RLS", () => {
  let viewer: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    admin = undefined;
  });

  it("lets any authenticated user read company_events", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.from("company_events").select("*");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("blocks a Viewer (no can_manage_platform) from creating an event", async () => {
    viewer = await createTestUser("Viewer");

    const { error } = await viewer.client
      .from("company_events")
      .insert({ name: "Should Fail Event", event_date: "2030-01-01" });

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin create an event", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("company_events")
      .insert({ name: `Test Event ${admin.id}`, event_date: "2030-01-01" })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.name).toContain("Test Event");

    const adminClient = createAdminClient();
    await adminClient.from("company_events").delete().eq("id", data!.id);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/test/integration/companyEventsRls.test.ts`
Expected: FAIL — `relation "public.company_events" does not exist` (PGRST205).

- [ ] **Step 3: Generate the migration**

Run: `npx supabase migration new company_events`

```sql
create table public.company_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  created_at timestamptz not null default now()
);

alter table public.company_events enable row level security;

create policy "company_events_select_any_authenticated" on public.company_events
for select
using ( auth.uid() is not null );

create policy "company_events_write_platform_managers" on public.company_events
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "company_events_update_platform_managers" on public.company_events
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "company_events_delete_platform_managers" on public.company_events
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
```

- [ ] **Step 4: Apply the migration — MANUAL STEP, hand SQL to the human**

The Supabase CLI is not linked on this machine (long-standing, known, separate blocker — same as every other migration so far in this project). Do NOT run `npx supabase db push` or `npx supabase link`. Instead:
1. Write the migration file (Step 3).
2. Write the test file (Step 1) and confirm it fails (Step 2).
3. Report back with the exact generated migration filename and the full SQL content (verbatim), so a human can paste it into the Supabase dashboard SQL Editor.
4. Do NOT commit anything yet — the finishing agent (after the human confirms the SQL ran) will verify GREEN and commit both files together.

- [ ] **Step 5: (finishing step, after human confirms) Run the test again to verify it passes, then commit**

```bash
git add supabase/migrations/<timestamp>_company_events.sql src/test/integration/companyEventsRls.test.ts
git commit -m "feat: add company_events table with RLS"
```

---

### Task 2: `formatMonthDay` pure helper (TDD)

**Files:**
- Modify: `src/lib/contacts.ts`
- Modify: `src/lib/contacts.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/contacts.test.ts`:
```typescript
import { formatMonthDay } from "./contacts";

describe("formatMonthDay", () => {
  it("formats a date string as 'day de month' in Spanish", () => {
    expect(formatMonthDay("1990-07-14")).toBe("14 de julio");
  });

  it("does not zero-pad the day", () => {
    expect(formatMonthDay("2026-01-05")).toBe("5 de enero");
  });

  it("covers December correctly", () => {
    expect(formatMonthDay("2000-12-25")).toBe("25 de diciembre");
  });
});
```
(Merge `formatMonthDay` into the existing `import { ... } from "./contacts";` line in the test file rather than adding a second import statement.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: FAIL — `formatMonthDay` not exported yet (the other tests in the file, including the ones just added in prior tasks, should still pass).

- [ ] **Step 3: Implement**

Append to `src/lib/contacts.ts`:
```typescript
const MONTH_NAMES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatMonthDay(dateString: string): string {
  const [, month, day] = dateString.split("-").map(Number);
  return `${day} de ${MONTH_NAMES_ES[month - 1]}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contacts.ts src/lib/contacts.test.ts
git commit -m "feat: add formatMonthDay helper for birthday and event dates"
```

---

### Task 3: Admin page for activities/holidays (`/activities`)

**Files:**
- Create: `src/app/(app)/(admin)/activities/page.tsx`
- Create: `src/app/(app)/(admin)/activities/actions.ts`
- Create: `src/app/(app)/(admin)/activities/ActivityForm.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

This follows the exact same table+modal pattern as `src/app/(app)/(admin)/companies/` (page.tsx + actions.ts + CompanyForm.tsx) — read those three files first as the direct template, then adapt field names (`name` + `event_date` instead of just `name`).

- [ ] **Step 1: Server action**

`src/app/(app)/(admin)/activities/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createActivity(name: string, eventDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("company_events").insert({ name, event_date: eventDate });
  if (error) return { error: error.message };
  revalidatePath("/activities");
  revalidatePath("/contacts");
  return {};
}
```
(`revalidatePath("/contacts")` is included because the contacts page's events widget, added in Task 4, reads from the same table.)

- [ ] **Step 2: Page (list + gate + empty state, mirroring `companies/page.tsx`)**

`src/app/(app)/(admin)/activities/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PartyPopper } from "lucide-react";
import { formatMonthDay } from "@/lib/contacts";
import { ActivityForm } from "./ActivityForm";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: events } = await supabase
    .from("company_events")
    .select("*")
    .order("event_date");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Actividades y días de fiesta</h1>
        <ActivityForm />
      </div>
      {(events ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <PartyPopper className="size-8" />
          <p className="text-sm">No hay actividades todavía.</p>
          <p className="text-xs">Crea la primera con el botón &quot;Nueva actividad&quot;.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(events ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell>{formatMonthDay(e.event_date)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Form (Dialog, mirroring `CompanyForm.tsx`, with a date input added)**

`src/app/(app)/(admin)/activities/ActivityForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
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
import { createActivity } from "./actions";

export function ActivityForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createActivity(name, eventDate);
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        setEventDate("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Nueva actividad</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva actividad o día de fiesta</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input
            placeholder="Ej. Día del trabajo, Posada de fin de año"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name || !eventDate}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Add "Actividades" to the sidebar's Ajustes group**

In `src/app/(app)/Sidebar.tsx`, import `PartyPopper` from `lucide-react` and add one more entry to the `settingsLinks` array (after Departamentos):
```tsx
{ href: "/activities", label: "Actividades", icon: PartyPopper },
```

- [ ] **Step 5: Manual verification (adapted, see override below)**

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/(admin)/activities src/app/(app)/Sidebar.tsx
git commit -m "feat: add admin page for company activities and holidays"
```

#### Override for Step 5

Cannot browser-test interactively. Run `npx tsc --noEmit` (no errors expected) and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/activities` (expect a redirect, not a crash). This task depends on Task 1's table existing in the live database — if Task 1 hasn't been applied yet when this task runs, `curl` will still return a redirect (the page's own auth gate runs before any query), so this specific check doesn't prove the table exists; that's fine, Task 1 verifies that independently.

---

### Task 4: Redesign the birthdays widget and add the events widget, both moved to the bottom of `/contacts`

**Files:**
- Modify: `src/app/(app)/contacts/BirthdaysWidget.tsx`
- Create: `src/app/(app)/contacts/EventsWidget.tsx`
- Modify: `src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Redesign `BirthdaysWidget.tsx` — card, icon, actual date per person, tasteful entrance animation**

`src/app/(app)/contacts/BirthdaysWidget.tsx`:
```tsx
import { Cake } from "lucide-react";
import { formatMonthDay, type BirthdayContact } from "@/lib/contacts";

export function BirthdaysWidget({ contacts }: { contacts: BirthdayContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-4 duration-500">
      <div className="mb-3 flex items-center gap-2 font-medium">
        <Cake className="size-4 text-primary" />
        Próximos cumpleaños
      </div>
      <ul className="space-y-2 text-sm">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4">
            <span>{c.name}</span>
            <span className="text-muted-foreground">
              {c.birth_date ? formatMonthDay(c.birth_date) : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create `EventsWidget.tsx` (same visual language, separate card)**

`src/app/(app)/contacts/EventsWidget.tsx`:
```tsx
import { PartyPopper } from "lucide-react";
import { formatMonthDay } from "@/lib/contacts";

export interface CompanyEvent {
  id: string;
  name: string;
  event_date: string;
}

export function EventsWidget({ events }: { events: CompanyEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border p-4 duration-500">
      <div className="mb-3 flex items-center gap-2 font-medium">
        <PartyPopper className="size-4 text-primary" />
        Próximas actividades y días de fiesta
      </div>
      <ul className="space-y-2 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-4">
            <span>{e.name}</span>
            <span className="text-muted-foreground">{formatMonthDay(e.event_date)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Wire both into `page.tsx` at the bottom, side by side, and fetch the upcoming events**

In `src/app/(app)/contacts/page.tsx`:
- Import `EventsWidget` (and its `CompanyEvent` type if needed).
- After the existing `birthdayContacts` computation, add a query for upcoming events:
```tsx
const today = new Date().toISOString().slice(0, 10);
const { data: upcomingEvents } = await supabase
  .from("company_events")
  .select("id, name, event_date")
  .gte("event_date", today)
  .order("event_date")
  .limit(5);
```
- Remove the `<BirthdaysWidget contacts={birthdayContacts} />` line from its current position (right after the `<h1>`/"Nuevo contacto" row, before the view switcher).
- After the closing of the view-switch conditional block (i.e., at the very end of the page's main `<div>`, after the table/cards/grouped/org content), add:
```tsx
{(birthdayContacts.length > 0 || (upcomingEvents ?? []).length > 0) && (
  <div className="grid gap-4 sm:grid-cols-2">
    <BirthdaysWidget contacts={birthdayContacts} />
    <EventsWidget events={upcomingEvents ?? []} />
  </div>
)}
```

- [ ] **Step 4: Manual verification (adapted, see override below)**

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/contacts/BirthdaysWidget.tsx src/app/(app)/contacts/EventsWidget.tsx src/app/(app)/contacts/page.tsx
git commit -m "feat: redesign birthdays card and add events/holidays card at the bottom of contacts"
```

#### Override for Step 4

Cannot browser-test interactively. Run `npx tsc --noEmit` and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/contacts` (expect a redirect, not a crash). Note that seeing the actual cards, their animation, and real event data requires the human's browser and at least one contact with a `birth_date` / one row in `company_events` (created via `/activities`) — defer that to the human's later pass.

---

### Task 5: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** `npm test` — expect all tests passing (including the new `company_events` RLS test and `formatMonthDay` unit tests).
- [ ] **Step 2:** `npx tsc --noEmit` — expect clean.
- [ ] **Step 3:** Smoke-curl `/contacts`, `/activities` — expect redirects, not 500s.
