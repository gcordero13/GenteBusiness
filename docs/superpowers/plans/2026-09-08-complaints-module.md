# Quejas/Complaints Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in platform user submit a report/complaint (anonymously or with their name), and let a small, explicitly-managed list of people (independent of role profiles) review submitted reports on an interactive mini-dashboard.

**Architecture:** Two new tables (`complaints`, `complaint_viewers`) plus two `security definer` functions (`submit_complaint`, `can_view_complaints`) enforce true anonymity and viewer access entirely at the database level — `complaints` has no INSERT policy at all, so only `submit_complaint` can create rows, and it never looks up or stores identity when a submission is anonymous. Viewing access is a brand-new per-user grant (not the existing per-role-profile model), managed from the existing "Perfiles de rol" screen but reusing that screen's own `can_manage` permission rather than inventing a new one.

**Tech Stack:** Next.js 16 Server Components, Supabase Postgres (`security definer` functions, RLS), TypeScript, Vitest, existing shadcn `Table`/`Select`/`Badge` primitives, a small hand-built SVG bar chart (no new charting dependency).

**Spec:** `docs/superpowers/specs/2026-09-08-complaints-module-design.md`.

---

## File Structure

- **Create** `supabase/migrations/20260908100000_complaints_module.sql` — `complaints`, `complaint_viewers`, `can_view_complaints()`, `submit_complaint()`.
- **Create** `src/test/integration/complaints.test.ts` — RLS/RPC integration tests.
- **Modify** `src/app/(app)/layout.tsx` / `src/app/(app)/Sidebar.tsx` — always-visible "Enviar queja" link + conditional "Quejas" link.
- **Create** `src/app/(app)/quejas/nueva/page.tsx`, `NewComplaintForm.tsx`, `actions.ts` — submission page, open to any authenticated user.
- **Create** `src/app/(app)/quejas/ComplaintsSummaryCards.tsx`, `ComplaintsCategoryChart.tsx`, `ComplaintsList.tsx` — presentational dashboard pieces.
- **Create** `src/app/(app)/quejas/ComplaintsFilterBar.tsx` — URL-driven category filter + text search.
- **Create** `src/app/(app)/quejas/page.tsx` — the review dashboard, gated by `can_view_complaints()`.
- **Modify** `src/app/(app)/(admin)/role-profiles/ComplaintViewersPanel.tsx` (new), `actions.ts`, `page.tsx` — viewer-list management panel.

---

## Task 1: Migration — tables, functions, RLS

**Files:**
- Create: `supabase/migrations/20260908100000_complaints_module.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260908100000_complaints_module.sql`:

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

alter table public.complaints enable row level security;
-- No insert policy at all - only submit_complaint() (security definer) may
-- write, same convention as time_clock_devices/time_clock_punches
-- (20260810120000_attendance_devices_and_punches.sql). This is what makes
-- anonymous submissions genuinely untraceable: there is no direct INSERT
-- path a client (or even a future admin query) could ever use to attach
-- identifying info to an anonymous row.

create table public.complaint_viewers (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (app_user_id)
);

alter table public.complaint_viewers enable row level security;

-- Central check: can the caller see complaints at all? Used both by the
-- complaints SELECT policy below and by the app to decide whether to show
-- the "Quejas" sidebar link / gate the review page.
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

create policy "complaints_select_viewers" on public.complaints
for select using (public.can_view_complaints());

-- Reuses the SAME "who administers this" gate already used for
-- role_profile_permissions (20260715120543_per_module_permissions.sql) - a
-- brand-new per-user access grant doesn't need a brand-new permission
-- concept just to control who can hand it out.
create policy "complaint_viewers_select_managers" on public.complaint_viewers
for select using (coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false));
create policy "complaint_viewers_write_managers" on public.complaint_viewers
for all using (coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false))
with check (coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false));

-- The ONLY way to create a complaint. Resolves the submitter's own
-- contact_id server-side (never accepts one as a parameter, so a client can
-- never supply someone else's identity) and only when p_is_anonymous is
-- false - when true, no identifying data is looked up or stored at all,
-- guaranteeing true anonymity even against direct database access.
create or replace function public.submit_complaint(p_category text, p_message text, p_is_anonymous boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  if not p_is_anonymous then
    select c.id into v_contact_id
    from public.contacts c
    where c.email = (select au.email from public.app_users au where au.id = auth.uid());
  end if;

  insert into public.complaints (category, message, is_anonymous, contact_id)
  values (p_category, p_message, p_is_anonymous, v_contact_id)
  returning id into v_id;

  return v_id;
end;
$$;
```

- [ ] **Step 2: STOP — human applies the migration**

Do NOT paste this SQL into Supabase yourself. Tell the human the migration is ready at `supabase/migrations/20260908100000_complaints_module.sql` and wait for them to paste it into the Supabase SQL Editor and confirm it ran successfully. **Do not proceed to Task 2 until they explicitly confirm.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260908100000_complaints_module.sql
git commit -m "feat: add the Quejas/Complaints module database layer"
```

---

## Task 2: Integration tests

**Files:**
- Create: `src/test/integration/complaints.test.ts`

Depends on Task 1's migration being applied (confirmed by the human).

- [ ] **Step 1: Write the tests**

Read `src/test/integration/ponchadorVisibility.test.ts` first for the exact `createTestUser`/`createAdminClient`/cleanup conventions this new file should follow.

Create `src/test/integration/complaints.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("Complaints module", () => {
  let viewer: TestUser | undefined;
  let superAdmin: TestUser | undefined;
  let contactIds: string[] = [];
  let complaintIds: string[] = [];
  let viewerRowIds: string[] = [];

  afterEach(async () => {
    const admin = createAdminClient();
    for (const id of complaintIds) {
      const { error } = await admin.from("complaints").delete().eq("id", id);
      if (error) console.warn(`failed to delete complaint ${id}: ${error.message}`);
    }
    complaintIds = [];
    for (const id of viewerRowIds) {
      const { error } = await admin.from("complaint_viewers").delete().eq("id", id);
      if (error) console.warn(`failed to delete complaint_viewer ${id}: ${error.message}`);
    }
    viewerRowIds = [];
    for (const id of contactIds) {
      const { error } = await admin.from("contacts").delete().eq("id", id);
      if (error) console.warn(`failed to delete contact ${id}: ${error.message}`);
    }
    contactIds = [];
    if (viewer) await deleteTestUser(viewer.id);
    if (superAdmin) await deleteTestUser(superAdmin.id);
    viewer = undefined;
    superAdmin = undefined;
  });

  it("submit_complaint stores no identifying data when anonymous", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: id, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "otro",
      p_message: "Prueba anónima",
      p_is_anonymous: true,
    });
    expect(error).toBeNull();
    complaintIds.push(id as string);

    const { data: row } = await admin.from("complaints").select("*").eq("id", id).single();
    expect(row?.is_anonymous).toBe(true);
    expect(row?.contact_id).toBeNull();
  });

  it("submit_complaint resolves the caller's own contact_id when not anonymous", async () => {
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: ownContact } = await admin
      .from("contacts")
      .insert({ first_name: "Test", last_name: "User", email: viewer.email })
      .select()
      .single();
    contactIds.push(ownContact!.id);

    const { data: id, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "seguridad",
      p_message: "Prueba con nombre",
      p_is_anonymous: false,
    });
    expect(error).toBeNull();
    complaintIds.push(id as string);

    const { data: row } = await admin.from("complaints").select("*").eq("id", id).single();
    expect(row?.is_anonymous).toBe(false);
    expect(row?.contact_id).toBe(ownContact!.id);
  });

  it("submit_complaint rejects an invalid category", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.rpc("submit_complaint", {
      p_category: "categoria_invalida",
      p_message: "Prueba",
      p_is_anonymous: true,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("a viewer in complaint_viewers can select complaints; a non-viewer sees none", async () => {
    viewer = await createTestUser("Viewer");
    superAdmin = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: id } = await superAdmin.client.rpc("submit_complaint", {
      p_category: "etica",
      p_message: "Visible solo para viewers",
      p_is_anonymous: true,
    });
    complaintIds.push(id as string);

    const { data: asNonViewer, error: nonViewerError } = await viewer.client
      .from("complaints")
      .select("id")
      .eq("id", id);
    expect(nonViewerError).toBeNull();
    expect(asNonViewer).toEqual([]);

    const { data: viewerRow } = await admin
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    viewerRowIds.push(viewerRow!.id);

    const { data: asViewer, error: viewerError } = await viewer.client
      .from("complaints")
      .select("id")
      .eq("id", id);
    expect(viewerError).toBeNull();
    expect(asViewer?.map((r: { id: string }) => r.id)).toEqual([id]);
  });

  it("direct insert into complaints is rejected for everyone - only submit_complaint may write", async () => {
    viewer = await createTestUser("Viewer");

    const { error } = await viewer.client
      .from("complaints")
      .insert({ category: "otro", message: "Intento directo", is_anonymous: true });

    expect(error).not.toBeNull();
  });

  it("a can_manage (Super Admin) user can add complaint viewers; a Viewer cannot", async () => {
    superAdmin = await createTestUser("Super Admin");
    viewer = await createTestUser("Viewer");
    const admin = createAdminClient();

    const { data: added, error: addError } = await superAdmin.client
      .from("complaint_viewers")
      .insert({ app_user_id: viewer.id })
      .select()
      .single();
    expect(addError).toBeNull();
    viewerRowIds.push(added!.id);

    const { data: outsider } = await admin.auth.admin.createUser({
      email: `test-outsider-${viewer.id}@example.com`,
      password: "irrelevant-password",
      email_confirm: true,
    });

    const { error: viewerAddError } = await viewer.client
      .from("complaint_viewers")
      .insert({ app_user_id: outsider!.user!.id });
    expect(viewerAddError).not.toBeNull();

    await admin.auth.admin.deleteUser(outsider!.user!.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun run test -- complaints.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/complaints.test.ts
git commit -m "test: add integration tests for the Complaints module"
```

---

## Task 3: Sidebar/layout wiring

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

Independent of Tasks 1/2 for compilation purposes (though `canViewComplaints` won't reflect real data until the migration is applied).

- [ ] **Step 1: Update `layout.tsx`**

In `src/app/(app)/layout.tsx`, add this call right after the `permissions` Map is built:

```tsx
const { data: canViewComplaints } = await supabase.rpc("can_view_complaints");
```

And add `canViewComplaints={Boolean(canViewComplaints)}` to the `<AppShell ...>` props (anywhere among the existing `canView*`/`canManage*` props - order doesn't matter).

- [ ] **Step 2: Update `Sidebar.tsx`**

Add `Inbox` and `MessageSquareWarning` to the existing `lucide-react` import list (alphabetized alongside the existing icons).

Add `canViewComplaints: boolean;` to the props type, and `canViewComplaints,` to the destructured props.

In the `mainLinks` array, add two entries — one always shown, one conditional:

```tsx
  const mainLinks: NavLink[] = [
    { href: "/my-profile", label: "Mi perfil", icon: UserCircle },
    { href: "/quejas/nueva", label: "Enviar queja", icon: MessageSquareWarning },
    ...(canViewComplaints ? [{ href: "/quejas", label: "Quejas", icon: Inbox }] : []),
    ...(canViewPonchador ? [{ href: "/ponchador", label: "Ponchador", icon: CalendarClock }] : []),
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canUseDocumentStamps ? [{ href: "/document-stamps", label: "Sellos y Firmas", icon: FileSignature }] : []),
    ...(canViewMaintenance ? [{ href: "/maintenance", label: "Mantenimientos", icon: Wrench }] : []),
    ...(canManageUsers ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];
```

(Only the two new lines are new — everything else in that array is unchanged, reproduced here so the exact insertion point is unambiguous.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors (neither `/quejas` nor `/quejas/nueva` exist yet, but a plain `<a>`-style nav link with a hardcoded `href` string doesn't require the route to exist for TypeScript to be satisfied — this only becomes a real 404 until Tasks 4/7 land, which is fine, this task is purely additive UI wiring).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/Sidebar.tsx"
git commit -m "feat: add Complaints module links to the sidebar"
```

---

## Task 4: `/quejas/nueva` submission page

**Files:**
- Create: `src/app/(app)/quejas/nueva/actions.ts`
- Create: `src/app/(app)/quejas/nueva/NewComplaintForm.tsx`
- Create: `src/app/(app)/quejas/nueva/page.tsx`

Depends on Task 1's migration being applied for the `submit_complaint` RPC to actually work at runtime (compiles fine without it).

- [ ] **Step 1: Write `actions.ts`**

Create `src/app/(app)/quejas/nueva/actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export interface SubmitComplaintInput {
  category: string;
  message: string;
  isAnonymous: boolean;
}

interface SubmitComplaintResult {
  error?: string;
}

export async function submitComplaint(input: SubmitComplaintInput): Promise<SubmitComplaintResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!input.message.trim()) return { error: "El mensaje no puede estar vacío" };

  const { error } = await supabase.rpc("submit_complaint", {
    p_category: input.category,
    p_message: input.message,
    p_is_anonymous: input.isAnonymous,
  });
  if (error) return { error: error.message };

  return {};
}
```

- [ ] **Step 2: Write `NewComplaintForm.tsx`**

Create `src/app/(app)/quejas/nueva/NewComplaintForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { submitComplaint } from "./actions";

const CATEGORIES = [
  { value: "acoso", label: "Acoso" },
  { value: "seguridad", label: "Seguridad" },
  { value: "etica", label: "Ética" },
  { value: "recursos_humanos", label: "Recursos Humanos" },
  { value: "otro", label: "Otro" },
];

export function NewComplaintForm() {
  const router = useRouter();
  const [category, setCategory] = useState("otro");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!message.trim()) {
      setError("Escribe un mensaje antes de enviar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitComplaint({ category, message, isAnonymous });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setMessage("");
      setCategory("otro");
      setIsAnonymous(true);
      router.refresh();
    });
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-6 text-center">
        <p className="text-lg font-semibold">Tu queja fue enviada.</p>
        <p className="mt-1 text-sm text-muted-foreground">Gracias por reportarlo.</p>
        <Button className="mt-4" variant="outline" onClick={() => setSuccess(false)}>
          Enviar otra
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-1">
        <Label>Categoría</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                category === c.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Mensaje</Label>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe lo que quieres reportar..."
        />
      </div>
      <div className="space-y-1">
        <Label>¿Cómo quieres enviarla?</Label>
        <div className="inline-flex rounded-lg border p-1">
          {(
            [
              { value: true, label: "Anónima" },
              { value: false, label: "Con mi nombre" },
            ] as const
          ).map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setIsAnonymous(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                isAnonymous === option.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <Button onClick={submit} disabled={isPending}>
        Enviar queja
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

Create `src/app/(app)/quejas/nueva/page.tsx`:

```tsx
import { NewComplaintForm } from "./NewComplaintForm";

export default function NewComplaintPage() {
  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Enviar queja o reporte</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Puedes enviarla de forma anónima o con tu nombre. Solo la puede ver la persona autorizada.
      </p>
      <NewComplaintForm />
    </div>
  );
}
```

No permission check in this page — per the design, submission is open to anyone who can reach the `(app)` route group at all (i.e., anyone logged in), matching the "no module gate for submitting" decision.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/quejas/nueva/actions.ts" "src/app/(app)/quejas/nueva/NewComplaintForm.tsx" "src/app/(app)/quejas/nueva/page.tsx"
git commit -m "feat: add the Quejas submission page"
```

---

## Task 5: Complaints dashboard presentational components

**Files:**
- Create: `src/app/(app)/quejas/ComplaintsSummaryCards.tsx`
- Create: `src/app/(app)/quejas/ComplaintsCategoryChart.tsx`
- Create: `src/app/(app)/quejas/ComplaintsList.tsx`

Independent of Tasks 1-4. No test files (no component-level tests anywhere in this codebase).

- [ ] **Step 1: Write `ComplaintsSummaryCards.tsx`**

Create `src/app/(app)/quejas/ComplaintsSummaryCards.tsx`:

```tsx
export interface ComplaintsSummary {
  total: number;
  anonymous: number;
  named: number;
}

export function ComplaintsSummaryCards({ summary }: { summary: ComplaintsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Total de quejas</p>
        <p className="mt-2 text-2xl font-bold">{summary.total}</p>
      </div>
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Anónimas</p>
        <p className="mt-2 text-2xl font-bold">{summary.anonymous}</p>
      </div>
      <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Con nombre</p>
        <p className="mt-2 text-2xl font-bold">{summary.named}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ComplaintsCategoryChart.tsx`**

Create `src/app/(app)/quejas/ComplaintsCategoryChart.tsx`:

```tsx
export interface CategoryCount {
  category: string;
  label: string;
  count: number;
}

export function ComplaintsCategoryChart({ counts }: { counts: CategoryCount[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  const barHeight = 24;
  const gap = 12;
  const chartHeight = counts.length * (barHeight + gap);
  const labelWidth = 140;
  const chartWidth = 320;

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-3 text-sm font-semibold">Quejas por categoría</p>
      <svg
        width="100%"
        viewBox={`0 0 ${labelWidth + chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Quejas por categoría"
      >
        {counts.map((c, i) => {
          const y = i * (barHeight + gap);
          const width = (c.count / max) * chartWidth;
          return (
            <g key={c.category}>
              <text x={0} y={y + barHeight / 2 + 4} className="fill-muted-foreground text-xs">
                {c.label}
              </text>
              <rect x={labelWidth} y={y} width={width} height={barHeight} rx={4} className="fill-[#04B1AF]" />
              <text x={labelWidth + width + 6} y={y + barHeight / 2 + 4} className="fill-foreground text-xs font-medium">
                {c.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: Write `ComplaintsList.tsx`**

Create `src/app/(app)/quejas/ComplaintsList.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface ComplaintRow {
  id: string;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  submitterName: string | null;
}

export function ComplaintsList({ rows }: { rows: ComplaintRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay quejas para mostrar.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Quién envía</TableHead>
          <TableHead>Mensaje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const expanded = expandedId === row.id;
          return (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => setExpandedId(expanded ? null : row.id)}
            >
              <TableCell className="align-top">{row.createdAtLabel}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell className="align-top">
                {row.submitterName ?? <span className="text-muted-foreground">Anónima</span>}
              </TableCell>
              <TableCell className="max-w-md">
                <p className={expanded ? "whitespace-pre-wrap" : "truncate"}>{row.message}</p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors (none of these files are imported anywhere yet).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/quejas/ComplaintsSummaryCards.tsx" "src/app/(app)/quejas/ComplaintsCategoryChart.tsx" "src/app/(app)/quejas/ComplaintsList.tsx"
git commit -m "feat: add Complaints dashboard presentational components"
```

---

## Task 6: `ComplaintsFilterBar.tsx`

**Files:**
- Create: `src/app/(app)/quejas/ComplaintsFilterBar.tsx`

Independent of Tasks 1-5.

- [ ] **Step 1: Write the component**

Create `src/app/(app)/quejas/ComplaintsFilterBar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_CATEGORIES_VALUE = "__all__";

const CATEGORY_OPTIONS = [
  { value: "acoso", label: "Acoso" },
  { value: "seguridad", label: "Seguridad" },
  { value: "etica", label: "Ética" },
  { value: "recursos_humanos", label: "Recursos Humanos" },
  { value: "otro", label: "Otro" },
];

export function ComplaintsFilterBar({
  category,
  search,
}: {
  category: string | null;
  search: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(search);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL_CATEGORIES_VALUE) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/quejas?${params.toString()}`);
  }

  function submitSearch() {
    updateParam("search", searchValue);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={category ?? ALL_CATEGORIES_VALUE}
        onValueChange={(value) => value && updateParam("category", value)}
      >
        <SelectTrigger className="w-56">
          <SelectValue>
            {(value: string) =>
              value === ALL_CATEGORIES_VALUE
                ? "Todas las categorías"
                : (CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CATEGORIES_VALUE}>Todas las categorías</SelectItem>
          {CATEGORY_OPTIONS.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        onBlur={submitSearch}
        onKeyDown={(e) => e.key === "Enter" && submitSearch()}
        placeholder="Buscar en el mensaje..."
        className="w-64"
      />
    </div>
  );
}
```

Note the `Select`'s `SelectValue` render-function child — this codebase's `Select` (base-ui, not Radix) doesn't build an id→label map from declarative `SelectItem` children, so a value that isn't already its own label (like the `__all__` sentinel) needs this explicit mapping — the exact same fix already applied to `PonchadorDepartmentFilter.tsx` earlier this session.

The search input intentionally updates the URL only on blur/Enter, not on every keystroke, to avoid re-navigating on each character typed.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/quejas/ComplaintsFilterBar.tsx"
git commit -m "feat: add the Complaints category/search filter bar"
```

---

## Task 7: `/quejas/page.tsx` — the review dashboard

**Files:**
- Create: `src/app/(app)/quejas/page.tsx`

Depends on Tasks 1, 5, 6.

- [ ] **Step 1: Write the page**

Create `src/app/(app)/quejas/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComplaintsSummaryCards } from "./ComplaintsSummaryCards";
import { ComplaintsCategoryChart } from "./ComplaintsCategoryChart";
import { ComplaintsFilterBar } from "./ComplaintsFilterBar";
import { ComplaintsList, type ComplaintRow } from "./ComplaintsList";

const CATEGORY_LABELS: Record<string, string> = {
  acoso: "Acoso",
  seguridad: "Seguridad",
  etica: "Ética",
  recursos_humanos: "Recursos Humanos",
  otro: "Otro",
};

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>;
}) {
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_complaints");
  if (!canView) {
    redirect("/");
  }

  const { data: complaintsRows } = await supabase
    .from("complaints")
    .select("id, created_at, category, message, is_anonymous, contact_id, contacts(first_name, last_name)")
    .order("created_at", { ascending: false });

  const allComplaints = complaintsRows ?? [];

  const summary = {
    total: allComplaints.length,
    anonymous: allComplaints.filter((c) => c.is_anonymous).length,
    named: allComplaints.filter((c) => !c.is_anonymous).length,
  };

  const categoryCounts = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    category: value,
    label,
    count: allComplaints.filter((c) => c.category === value).length,
  }));

  const params = await searchParams;
  const filtered = allComplaints.filter((c) => {
    if (params.category && c.category !== params.category) return false;
    if (params.search && !c.message.toLowerCase().includes(params.search.toLowerCase())) return false;
    return true;
  });

  const rows: ComplaintRow[] = filtered.map((c) => {
    const contact = c.contacts as { first_name: string; last_name: string } | null;
    return {
      id: c.id,
      createdAtLabel: new Date(c.created_at).toLocaleDateString("es-DO", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      categoryLabel: CATEGORY_LABELS[c.category] ?? c.category,
      message: c.message,
      submitterName: c.is_anonymous || !contact ? null : `${contact.first_name} ${contact.last_name}`,
    };
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Quejas y reportes</h1>
        <p className="text-sm text-muted-foreground">Solo tú puedes ver esta información.</p>
      </div>
      <ComplaintsSummaryCards summary={summary} />
      <ComplaintsCategoryChart counts={categoryCounts} />
      <ComplaintsFilterBar category={params.category ?? null} search={params.search ?? ""} />
      <ComplaintsList rows={rows} />
    </div>
  );
}
```

Filtering (category + text search) happens in plain TypeScript over the already-fetched full list rather than as separate `.eq()`/`.ilike()` database queries — this dashboard is for exactly one (later, a handful of) reviewers looking at a company's internal complaint volume, which is never going to be large enough to need query-level filtering, and doing it this way means the summary cards, chart, and filtered list all derive from one single fetch.

- [ ] **Step 2: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bun run test`
Expected: all tests pass aside from the pre-existing Supabase-auth rate-limit flakiness confirmed dozens of times this session (a small, varying number of failures in unrelated integration test files, all with the exact message "Request rate limit reached"). Re-run `bun run test -- complaints.test.ts` in isolation to confirm 6/6 pass regardless of any full-suite flakiness.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/quejas/page.tsx"
git commit -m "feat: add the Quejas review dashboard page"
```

---

## Task 8: Role-profiles viewer-management panel

**Files:**
- Create: `src/app/(app)/(admin)/role-profiles/ComplaintViewersPanel.tsx`
- Modify: `src/app/(app)/(admin)/role-profiles/actions.ts`
- Modify: `src/app/(app)/(admin)/role-profiles/page.tsx`

Depends on Task 1 (the `complaint_viewers` table must exist for this to do anything real, though it compiles without it).

- [ ] **Step 1: Extend `actions.ts`**

The current full content of `src/app/(app)/(admin)/role-profiles/actions.ts` is:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ModulePermissionInput {
  module_id: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_deactivate: boolean;
  can_manage: boolean;
  can_authorize: boolean;
}

export interface RoleProfileInput {
  id?: string;
  name: string;
  permissions: ModulePermissionInput[];
}

export async function saveRoleProfile(input: RoleProfileInput) {
  const supabase = await createClient();
  const { id, name, permissions } = input;

  const profileQuery = id
    ? supabase.from("role_profiles").update({ name }).eq("id", id).select().single()
    : supabase.from("role_profiles").insert({ name }).select().single();

  const { data: profile, error: profileError } = await profileQuery;
  if (profileError || !profile) {
    return { error: profileError?.message ?? "No se pudo guardar el perfil" };
  }

  const rows = permissions.map((p) => ({ ...p, role_profile_id: profile.id }));
  const { error: permissionsError } = await supabase
    .from("role_profile_permissions")
    .upsert(rows, { onConflict: "role_profile_id,module_id" });

  if (permissionsError) {
    return { error: permissionsError.message };
  }

  revalidatePath("/role-profiles");
  return {};
}

export async function deleteRoleProfile(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("role_profiles").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}
```

Note this file relies entirely on RLS to reject unauthorized writes — it has no app-code permission check of its own. Append these two functions at the end, matching that same convention (no redundant app-code check, since `complaint_viewers`' own RLS write policy already enforces `can_manage` on `role_profiles`):

```typescript
export async function addComplaintViewer(appUserId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("complaint_viewers").insert({ app_user_id: appUserId });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}

export async function removeComplaintViewer(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("complaint_viewers").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}
```

- [ ] **Step 2: Write `ComplaintViewersPanel.tsx`**

Create `src/app/(app)/(admin)/role-profiles/ComplaintViewersPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addComplaintViewer, removeComplaintViewer } from "./actions";

export interface ComplaintViewerAppUserOption {
  id: string;
  email: string;
  fullName: string | null;
}

export interface ComplaintViewerRow {
  id: string;
  appUserId: string;
  label: string;
}

export function ComplaintViewersPanel({
  users,
  viewers,
}: {
  users: ComplaintViewerAppUserOption[];
  viewers: ComplaintViewerRow[];
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const viewerUserIds = new Set(viewers.map((v) => v.appUserId));
  const availableUsers = users.filter((u) => !viewerUserIds.has(u.id));

  function add() {
    if (!selectedUserId) return;
    setError(null);
    startTransition(async () => {
      const result = await addComplaintViewer(selectedUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedUserId(null);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeComplaintViewer(id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-1 text-sm font-semibold">Acceso a Quejas</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Estas personas pueden ver las quejas enviadas, sin importar su perfil de rol.
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="mb-3 space-y-2">
        {viewers.map((v) => (
          <li key={v.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>{v.label}</span>
            <Button variant="outline" size="sm" disabled={isPending} onClick={() => remove(v.id)}>
              Quitar
            </Button>
          </li>
        ))}
        {viewers.length === 0 && <li className="text-sm text-muted-foreground">Nadie tiene acceso todavía.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedUserId ?? undefined} onValueChange={(v) => v && setSelectedUserId(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Selecciona una persona">
              {(val: string) => {
                const u = availableUsers.find((x) => x.id === val);
                return u ? (u.fullName ?? u.email) : "Selecciona una persona";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName ?? u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={add} disabled={isPending || !selectedUserId}>
          Agregar
        </Button>
      </div>
    </div>
  );
}
```

The `SelectValue` render-function child is required here for the same reason as `ComplaintsFilterBar.tsx` and the earlier `PonchadorPersonSelector.tsx` fix — this codebase's `Select` doesn't resolve an id to its label on its own.

- [ ] **Step 3: Wire the panel into `page.tsx`**

The current full content of `src/app/(app)/(admin)/role-profiles/page.tsx` is:

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
import { RoleProfileForm } from "./RoleProfileForm";
import { DeleteRoleProfileDialog } from "./DeleteRoleProfileDialog";

export default async function RoleProfilesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "role_profiles",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: modules } = await supabase.from("modules").select("id, key, label").order("label");
  const { data: profiles } = await supabase
    .from("role_profiles")
    .select("id, name, role_profile_permissions(module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)")
    .order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Perfiles de rol</h1>
        <RoleProfileForm modules={modules ?? []} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-2">
                  <RoleProfileForm
                    modules={modules ?? []}
                    initial={{
                      id: profile.id,
                      name: profile.name,
                      permissions: (profile.role_profile_permissions ?? []) as never,
                    }}
                  />
                  {profile.name !== "Super Admin" && (
                    <DeleteRoleProfileDialog profileId={profile.id} name={profile.name} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

Replace the whole file with:

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
import { RoleProfileForm } from "./RoleProfileForm";
import { DeleteRoleProfileDialog } from "./DeleteRoleProfileDialog";
import { ComplaintViewersPanel, type ComplaintViewerAppUserOption, type ComplaintViewerRow } from "./ComplaintViewersPanel";

export default async function RoleProfilesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "role_profiles",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: modules } = await supabase.from("modules").select("id, key, label").order("label");
  const { data: profiles } = await supabase
    .from("role_profiles")
    .select("id, name, role_profile_permissions(module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)")
    .order("name");

  // Reads via the admin client (bypassing RLS) specifically because this
  // list must show EVERY app user regardless of the viewer's own can_manage
  // scope on the "users" module - someone could plausibly have can_manage on
  // role_profiles without also having it on users, and the picker below
  // still needs the full roster in that case. Same admin-client-for-a-
  // deliberately-company-wide-read precedent already used on the home page's
  // attendance summary cards and the Users page's contact-invite picker.
  const admin = createAdminClient();
  const { data: allUsers } = await admin.from("app_users").select("id, email, full_name").order("email");
  const { data: viewerRows } = await supabase
    .from("complaint_viewers")
    .select("id, app_user_id, app_users(email, full_name)")
    .order("created_at");

  const complaintViewerUsers: ComplaintViewerAppUserOption[] = (allUsers ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
  }));
  const complaintViewers: ComplaintViewerRow[] = (viewerRows ?? []).map((v) => {
    const appUser = v.app_users as { email: string; full_name: string | null } | null;
    return {
      id: v.id,
      appUserId: v.app_user_id,
      label: appUser?.full_name ?? appUser?.email ?? v.app_user_id,
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Perfiles de rol</h1>
        <RoleProfileForm modules={modules ?? []} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(profiles ?? []).map((profile) => (
            <TableRow key={profile.id}>
              <TableCell className="font-medium">{profile.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-2">
                  <RoleProfileForm
                    modules={modules ?? []}
                    initial={{
                      id: profile.id,
                      name: profile.name,
                      permissions: (profile.role_profile_permissions ?? []) as never,
                    }}
                  />
                  {profile.name !== "Super Admin" && (
                    <DeleteRoleProfileDialog profileId={profile.id} name={profile.name} />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ComplaintViewersPanel users={complaintViewerUsers} viewers={complaintViewers} />
    </div>
  );
}
```

- [ ] **Step 4: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bun run test`
Expected: same pre-existing rate-limit flakiness pattern as every prior task, no new failures. Re-run `bun run test -- complaints.test.ts` in isolation to confirm it's still 6/6.

- [ ] **Step 5: Manually re-verify the existing Role Profiles CRUD is unchanged**

Trace through: the existing `RoleProfileForm`/`DeleteRoleProfileDialog` usage, the `modules`/`profiles` fetch, and the table rendering are all byte-for-byte the same as before this task — only new code (the admin-client user fetch, the viewer-rows fetch, and the new panel at the bottom) was added.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/(admin)/role-profiles/ComplaintViewersPanel.tsx" "src/app/(app)/(admin)/role-profiles/actions.ts" "src/app/(app)/(admin)/role-profiles/page.tsx"
git commit -m "feat: add the Complaints viewer-access panel to Perfiles de rol"
```

---

## Self-Review Notes

- **Spec coverage:**
  - "Cualquier usuario con acceso a la plataforma" can submit → Task 4's `/quejas/nueva` page has no permission gate at all.
  - "Solo 1 persona puede ver, mecanismo nuevo independiente del perfil de rol" → Task 1's `complaint_viewers` table + `can_view_complaints()`, used by Task 7's page gate and Task 3's sidebar link.
  - "Se administra desde Perfiles de rol, reutilizando el permiso existente" → Task 8's panel and its RLS-enforced writes, gated by the SAME `can_manage` on `role_profiles` the page itself already requires — no new permission concept introduced.
  - "Categoría/tipo" field → Task 1's `category` check constraint + Task 4's category buttons + Task 7's `CATEGORY_LABELS` display.
  - "Anónima de verdad" → Task 1's `submit_complaint` never resolving/storing `contact_id` when `p_is_anonymous` is true, verified by Task 2's dedicated test.
  - "Tarjetas de resumen, gráfico, filtro/búsqueda, fila expandible" → Task 5 (cards + chart + list) + Task 6 (filter bar) + Task 7 (assembly).
  - Testing section → Task 2's 6 tests cover anonymous storage, named contact resolution, invalid category rejection, viewer-vs-non-viewer SELECT, direct-insert rejection, and `complaint_viewers` write gating.
  - Out-of-scope items (status tracking, attachments, notifications, submitter history, monthly-trend chart) → no task implements any of them.
- **Placeholder scan:** none found — every step has complete, concrete code.
- **Type consistency:** `ComplaintRow` (Task 5) is imported, not redeclared, by Task 7. `ComplaintsSummary`/`CategoryCount` (Task 5) match exactly what Task 7 constructs and passes in. `ComplaintViewerAppUserOption`/`ComplaintViewerRow` (Task 8) are defined once in `ComplaintViewersPanel.tsx` and imported by `page.tsx` in the same task. The `category` check-constraint values in Task 1's migration (`acoso`, `seguridad`, `etica`, `recursos_humanos`, `otro`) match exactly the `CATEGORIES`/`CATEGORY_OPTIONS`/`CATEGORY_LABELS` lists in Tasks 4, 6, and 7.
