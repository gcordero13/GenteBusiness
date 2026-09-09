# Complaints Triage & Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three UI issues on the already-shipped Quejas module (oversized chart labels, an in-place expand that should be a modal, a too-small submission form), add triage fields (ticket number, status, reviewer comment) plus an optional single photo attachment per complaint, and let a submitter see their own past submissions — all while preserving the module's existing true-anonymity guarantee.

**Architecture:** UI fixes are presentational-only, no schema change. Triage fields are added to `complaints` plus a new narrow `security definer` RPC (`update_complaint_status`) that can only ever touch `status`/`reviewer_comment` — `complaints` keeps its existing zero-UPDATE-policy guarantee for every other column. Photo upload copies this codebase's existing "private bucket, zero storage policies, service-role-only access" pattern (already used by `maintenance-signatures`/`maintenance-reports`) so an uploaded photo's Storage metadata never gets tagged with the real uploader's identity, even for non-anonymous submissions.

**Tech Stack:** Next.js 16 Server Components/Actions, Supabase Postgres + Storage, TypeScript, Vitest, existing shadcn/base-ui `Dialog`/`Select`/`Badge` primitives.

**Spec:** `docs/superpowers/specs/2026-09-09-complaints-triage-and-attachments-design.md` (extends `docs/superpowers/specs/2026-09-08-complaints-module-design.md`).

---

## File Structure

- **Create** `supabase/migrations/20260909100000_complaints_triage_and_attachments.sql` — `complaint_number`/`status`/`reviewer_comment`/`photo_path` columns, `update_complaint_status()`, `submit_complaint()` extended, `complaint-photos` storage bucket.
- **Modify** `src/test/integration/complaints.test.ts` — tests for `update_complaint_status` and the new `photo_path` parameter.
- **Modify** `src/app/(app)/quejas/ComplaintsCategoryChart.tsx` — rewrite as HTML/CSS bars.
- **Modify** `src/app/(app)/quejas/nueva/actions.ts`, `NewComplaintForm.tsx`, `page.tsx` — bigger UI + photo upload.
- **Create** `src/app/(app)/quejas/photo/[id]/route.ts` — streams a complaint's photo, gated by `can_view_complaints()`.
- **Create** `src/app/(app)/quejas/ComplaintDetailDialog.tsx`, `src/app/(app)/quejas/actions.ts` — modal detail view + status/comment editing.
- **Modify** `src/app/(app)/quejas/ComplaintsList.tsx`, `page.tsx` — wire in `complaint_number`/status badge/photo indicator, switch to the dialog.
- **Create** `src/app/(app)/quejas/nueva/MyComplaintsList.tsx` — the submitter's own past-submissions list, anonymous entries hidden until clicked.

---

## Task 7: "Mis quejas" — submitter's own past submissions, hidden-until-clicked for anonymous ones

**Files:**
- Modify: `src/app/(app)/quejas/nueva/actions.ts`
- Modify: `src/app/(app)/quejas/nueva/NewComplaintForm.tsx`
- Create: `src/app/(app)/quejas/nueva/MyComplaintsList.tsx`
- Modify: `src/app/(app)/quejas/nueva/page.tsx`

Depends on Task 1's migration (`list_my_complaints`) being applied. Compiles without it.

**Design:** named submissions are looked up server-side via the same `auth.uid()` → `contact_id` resolution `submit_complaint` already uses. Anonymous submissions have zero server-side identity by design — the browser remembers each anonymous complaint's `id` in `localStorage` right after a successful submission, and sends that list back to `list_my_complaints(p_anonymous_ids)` as proof of having submitted it. Per the request: an anonymous entry in this list is hidden by default (shows only its ticket number/category/date) and requires a click to reveal the message; a named entry is shown directly since it's already tied to the submitter's own identity.

- [ ] **Step 1: Read the current files in full**

Read the current `src/app/(app)/quejas/nueva/actions.ts`, `NewComplaintForm.tsx`, `page.tsx` (as they stand after Task 4's edits — do this task AFTER Task 4, since it builds on the same files) in full before editing.

- [ ] **Step 2: Add `listMyComplaints` to `actions.ts`**

Add this export to `src/app/(app)/quejas/nueva/actions.ts` (alongside the existing `submitComplaint`):

```typescript
export interface MyComplaintRow {
  id: string;
  complaintNumber: number;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  isAnonymous: boolean;
  status: string;
  statusLabel: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  acoso: "Acoso",
  seguridad: "Seguridad",
  etica: "Ética",
  recursos_humanos: "Recursos Humanos",
  otro: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
};

export async function listMyComplaints(anonymousIds: string[]): Promise<MyComplaintRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_complaints", { p_anonymous_ids: anonymousIds });
  if (error || !data) return [];

  return data.map((c: { id: string; complaint_number: number; created_at: string; category: string; message: string; is_anonymous: boolean; status: string }) => ({
    id: c.id,
    complaintNumber: c.complaint_number,
    createdAtLabel: new Date(c.created_at).toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "numeric" }),
    categoryLabel: CATEGORY_LABELS[c.category] ?? c.category,
    message: c.message,
    isAnonymous: c.is_anonymous,
    status: c.status,
    statusLabel: STATUS_LABELS[c.status] ?? c.status,
  }));
}
```

Also change `submitComplaint`'s return type/body to return the new complaint's id on success, so the caller can remember it: change `SubmitComplaintResult` to `interface SubmitComplaintResult { error?: string; id?: string; isAnonymous?: boolean; }`, and change the final RPC call from `const { error } = await supabase.rpc(...)` to `const { data: newId, error } = await supabase.rpc(...)`, returning `{ id: newId as string, isAnonymous: input.isAnonymous }` instead of `{}` on success.

- [ ] **Step 3: Write `MyComplaintsList.tsx`**

Create `src/app/(app)/quejas/nueva/MyComplaintsList.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { listMyComplaints, type MyComplaintRow } from "./actions";

const STORAGE_KEY = "quejas.myAnonymousComplaintIds";

export function getStoredAnonymousComplaintIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberAnonymousComplaintId(id: string) {
  try {
    const ids = getStoredAnonymousComplaintIds();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, id]));
  } catch {
    // localStorage unavailable (private browsing, etc.) - the submission
    // itself already succeeded server-side, this only affects whether the
    // submitter can find it again in "Mis quejas" later on this device.
  }
}

export function MyComplaintsList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<MyComplaintRow[] | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const anonymousIds = getStoredAnonymousComplaintIds();
    listMyComplaints(anonymousIds).then(setRows);
  }, [refreshKey]);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  function toggle(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-8 space-y-2">
      <p className="text-sm font-semibold">Mis quejas</p>
      <ul className="space-y-2">
        {rows.map((row) => {
          const revealed = !row.isAnonymous || revealedIds.has(row.id);
          return (
            <li key={row.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>#{row.complaintNumber}</span>
                <span>{row.createdAtLabel}</span>
                <Badge variant="outline">{row.categoryLabel}</Badge>
                <Badge variant="outline">{row.statusLabel}</Badge>
              </div>
              {revealed ? (
                <p className="mt-1 whitespace-pre-wrap">{row.message}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="mt-1 text-sm text-muted-foreground underline underline-offset-2"
                >
                  Anónima — clic para ver el contenido
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `NewComplaintForm.tsx`**

Read the current file (post-Task-4). After a successful `submitComplaint(...)` call, if the result has an `id` and `isAnonymous` is true, call `rememberAnonymousComplaintId(result.id)` (import from `./MyComplaintsList`). Add a `const [refreshKey, setRefreshKey] = useState(0);` and increment it (`setRefreshKey((k) => k + 1)`) alongside the other post-success resets, so `MyComplaintsList` refetches after a new submission. Render `<MyComplaintsList refreshKey={refreshKey} />` from the parent (`page.tsx`, not inside the success/non-success conditional branch of the form itself) — the list should stay visible regardless of whether the form is mid-submission or showing its success state, so lift `refreshKey` state up: either keep it in `NewComplaintForm` and have that component render `<MyComplaintsList>` itself outside the `if (success)` early return, or pass a callback prop down from `page.tsx`. Simplest: keep `MyComplaintsList` rendered directly inside `NewComplaintForm`'s returned JSX (both in the default and success branches, i.e., don't put it behind the early `if (success) return (...)` — restructure so the success banner and the form are conditionally one or the other, but `<MyComplaintsList refreshKey={refreshKey} />` renders unconditionally below both).

- [ ] **Step 5: Update `page.tsx` if needed**

Read the current file (post-Task-4) — if `MyComplaintsList` is fully rendered from within `NewComplaintForm` per Step 4, no change is needed here. Confirm by reading both files together.

- [ ] **Step 6: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 7: Run the full test suite once**

Run `bun run test`. Confirm no NEW failure types beyond the known rate-limit flake.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/quejas/nueva/actions.ts" "src/app/(app)/quejas/nueva/NewComplaintForm.tsx" "src/app/(app)/quejas/nueva/MyComplaintsList.tsx" "src/app/(app)/quejas/nueva/page.tsx"
git commit -m "feat: let a submitter see their own past complaints, anonymous ones hidden until clicked"
```

---

## Task 1: Migration — triage fields, update RPC, photo storage

**Files:**
- Create: `supabase/migrations/20260909100000_complaints_triage_and_attachments.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260909100000_complaints_triage_and_attachments.sql`:

```sql
alter table public.complaints
  add column complaint_number bigint generated always as identity,
  add column status text not null default 'nuevo' check (status in ('nuevo', 'en_proceso', 'resuelto')),
  add column reviewer_comment text,
  add column photo_path text;

alter table public.complaints add constraint complaints_complaint_number_key unique (complaint_number);

-- Narrow, bounded write path: complaints keeps its existing zero-UPDATE-policy
-- guarantee (verified by "direct update/delete against complaints is rejected
-- for everyone" in complaints.test.ts) for message/category/is_anonymous/
-- contact_id/photo_path - none of those become editable. This function is the
-- ONLY way to change a complaint after submission, and it can only ever touch
-- status/reviewer_comment.
create or replace function public.update_complaint_status(p_id uuid, p_status text, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_view_complaints() then
    raise exception 'not authorized';
  end if;

  update public.complaints
  set status = p_status, reviewer_comment = p_comment
  where id = p_id;
end;
$$;

-- submit_complaint grows an optional p_photo_path: a storage path string
-- (never derived from or containing the uploader's identity - it's a random
-- key generated by the Server Action before calling this function), stored
-- identically whether the complaint is anonymous or named. One code path,
-- no branching that could regress the anonymity guarantee.
create or replace function public.submit_complaint(
  p_category text,
  p_message text,
  p_is_anonymous boolean,
  p_photo_path text default null
)
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

  if not p_is_anonymous and v_contact_id is null then
    raise exception 'could not resolve your contact record for a non-anonymous submission';
  end if;

  insert into public.complaints (category, message, is_anonymous, contact_id, photo_path)
  values (p_category, p_message, p_is_anonymous, v_contact_id, p_photo_path)
  returning id into v_id;

  return v_id;
end;
$$;

insert into storage.buckets (id, name, public)
values ('complaint-photos', 'complaint-photos', false)
on conflict (id) do nothing;

-- Deliberately no storage.objects policies, mirroring maintenance-signatures/
-- maintenance-reports (20260728100300_maintenance_storage_buckets.sql): every
-- read and write goes through the service-role admin client, never the
-- browser's own session. This is the load-bearing anonymity decision - if the
-- browser uploaded directly with the submitter's own session, Storage would
-- tag the object's owner with their real auth.uid() even for an anonymous
-- complaint, a real deanonymization vector. RLS is enabled by default on
-- storage.objects with zero policies, denying all access to anon/
-- authenticated roles - exactly what we want here.
```

IMPORTANT for whoever implements this: before finalizing, verify in the existing migrations directory that `generated always as identity` on an `alter table ... add column` is valid syntax for this Postgres version and that it correctly backfills existing rows (there may already be live complaint rows in production since this module has been live) — Postgres 10+ supports adding an identity column this way and will assign sequential values to existing rows in insertion order. Confirm no other migration in this repo has hit an issue doing this. Also double check `public.can_view_complaints()` really is callable as a plain boolean-returning function inside `update_complaint_status`'s plpgsql body exactly as written (it already is, per `20260908100000_complaints_module.sql`).

### Step 2: STOP — do NOT apply this migration yourself

You must NOT run this SQL against Supabase, and must NOT use any Supabase MCP/CLI tool to apply it. Only a human pastes migration SQL into the Supabase SQL Editor. Your job ends at creating the file and committing it.

### Step 3: Commit

```bash
git add supabase/migrations/20260909100000_complaints_triage_and_attachments.sql
git commit -m "feat: add Complaints triage fields, update RPC, and photo storage bucket"
```

---

## Task 2: Integration tests for the new RPC and photo_path

**Files:**
- Modify: `src/test/integration/complaints.test.ts`

Depends on Task 1's migration being applied (confirmed by the human).

- [ ] **Step 1: Read the current file in full**

Read `src/test/integration/complaints.test.ts` in full to see the exact existing helpers/cleanup arrays (`complaintIds`, `viewerRowIds`, `contactIds`, `createTestUser`, `createAdminClient`) before adding to it.

- [ ] **Step 2: Add new tests**

Add these `it()` blocks inside the existing `describe("Complaints module", ...)` block:

```typescript
it("update_complaint_status lets a viewer update status/comment; a non-viewer cannot", async () => {
  viewer = await createTestUser("Viewer");
  superAdmin = await createTestUser("Super Admin");
  const admin = createAdminClient();

  const { data: id } = await superAdmin.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Para actualizar estado",
    p_is_anonymous: true,
  });
  complaintIds.push(id as string);

  const { data: viewerRow } = await admin
    .from("complaint_viewers")
    .insert({ app_user_id: viewer.id })
    .select()
    .single();
  viewerRowIds.push(viewerRow!.id);

  const { error: nonViewerError } = await superAdmin.client.rpc("update_complaint_status", {
    p_id: id,
    p_status: "en_proceso",
    p_comment: "no debería aplicar",
  });
  // superAdmin here has can_manage on role_profiles but is NOT a complaint_viewers
  // row (only "viewer" was added above), so this must be rejected too - viewing
  // access, not role-profile management, is what update_complaint_status checks.
  expect(nonViewerError).not.toBeNull();

  const { error: viewerError } = await viewer.client.rpc("update_complaint_status", {
    p_id: id,
    p_status: "en_proceso",
    p_comment: "revisando",
  });
  expect(viewerError).toBeNull();

  const { data: row } = await admin.from("complaints").select("status, reviewer_comment").eq("id", id).single();
  expect(row?.status).toBe("en_proceso");
  expect(row?.reviewer_comment).toBe("revisando");
});

it("submit_complaint stores an optional photo_path identically for anonymous and named submissions", async () => {
  viewer = await createTestUser("Viewer");
  const admin = createAdminClient();

  const { data: anonId, error: anonError } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Con foto anónima",
    p_is_anonymous: true,
    p_photo_path: "test/anon-photo.png",
  });
  expect(anonError).toBeNull();
  complaintIds.push(anonId as string);

  const { data: anonRow } = await admin.from("complaints").select("photo_path, contact_id").eq("id", anonId).single();
  expect(anonRow?.photo_path).toBe("test/anon-photo.png");
  expect(anonRow?.contact_id).toBeNull();
});

it("complaint_number is assigned automatically and increases with each submission", async () => {
  viewer = await createTestUser("Viewer");
  const admin = createAdminClient();

  const { data: firstId } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Primera",
    p_is_anonymous: true,
  });
  complaintIds.push(firstId as string);
  const { data: secondId } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Segunda",
    p_is_anonymous: true,
  });
  complaintIds.push(secondId as string);

  const { data: rows } = await admin
    .from("complaints")
    .select("id, complaint_number")
    .in("id", [firstId, secondId]);
  const first = rows!.find((r: { id: string }) => r.id === firstId)!;
  const second = rows!.find((r: { id: string }) => r.id === secondId)!;
  expect(second.complaint_number).toBeGreaterThan(first.complaint_number);
});

it("direct update on complaints for status/reviewer_comment is still rejected - only update_complaint_status may write", async () => {
  viewer = await createTestUser("Viewer");
  const admin = createAdminClient();

  const { data: viewerRow } = await admin
    .from("complaint_viewers")
    .insert({ app_user_id: viewer.id })
    .select()
    .single();
  viewerRowIds.push(viewerRow!.id);

  const { data: id } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Intento de update directo",
    p_is_anonymous: true,
  });
  complaintIds.push(id as string);

  const { error } = await viewer.client
    .from("complaints")
    .update({ status: "resuelto" })
    .eq("id", id)
    .select()
    .single();
  expect(error).not.toBeNull();
});
```

- [ ] **Step 2b: Add tests for `list_my_complaints`**

Also add, inside the same `describe` block:

```typescript
it("list_my_complaints returns a submitter's own named complaints", async () => {
  viewer = await createTestUser("Viewer");
  const admin = createAdminClient();

  const { data: ownContact } = await admin
    .from("contacts")
    .insert({ first_name: "Test", last_name: "User", email: viewer.email })
    .select()
    .single();
  contactIds.push(ownContact!.id);

  const { data: id } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Mi propia queja con nombre",
    p_is_anonymous: false,
  });
  complaintIds.push(id as string);

  const { data: rows, error } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [] });
  expect(error).toBeNull();
  expect(rows?.map((r: { id: string }) => r.id)).toContain(id);
});

it("list_my_complaints returns an anonymous complaint only when its id is supplied, and never returns someone else's", async () => {
  viewer = await createTestUser("Viewer");
  superAdmin = await createTestUser("Super Admin");

  const { data: myAnonId } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Mi queja anónima",
    p_is_anonymous: true,
  });
  complaintIds.push(myAnonId as string);

  const { data: othersAnonId } = await superAdmin.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Queja anónima de otra persona",
    p_is_anonymous: true,
  });
  complaintIds.push(othersAnonId as string);

  const { data: withoutProof } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [] });
  expect(withoutProof?.map((r: { id: string }) => r.id)).not.toContain(myAnonId);

  const { data: withProof } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [myAnonId] });
  expect(withProof?.map((r: { id: string }) => r.id)).toContain(myAnonId);
  expect(withProof?.map((r: { id: string }) => r.id)).not.toContain(othersAnonId);

  const { data: guessingOthers } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [othersAnonId] });
  expect(guessingOthers?.map((r: { id: string }) => r.id)).not.toContain(othersAnonId);
});
```

- [ ] **Step 3: Run the tests**

Run: `bun run test -- complaints.test.ts`
Expected: PASS (15 tests total: the existing 9 plus these 6).

- [ ] **Step 4: Commit**

```bash
git add src/test/integration/complaints.test.ts
git commit -m "test: cover update_complaint_status, photo_path, and complaint_number"
```

---

## Task 3: Fix the category chart's oversized labels

**Files:**
- Modify: `src/app/(app)/quejas/ComplaintsCategoryChart.tsx`

Independent of every other task — presentational only, no data shape change (`CategoryCount` stays the same).

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/app/(app)/quejas/ComplaintsCategoryChart.tsx` with:

```tsx
export interface CategoryCount {
  category: string;
  label: string;
  count: number;
}

export function ComplaintsCategoryChart({ counts }: { counts: CategoryCount[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-3 text-sm font-semibold">Quejas por categoría</p>
      <div className="space-y-2">
        {counts.map((c) => (
          <div key={c.category} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{c.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-6 rounded bg-[#04B1AF]"
                style={{ width: `${(c.count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-medium">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Root cause being fixed: the previous version rendered bars/labels as raw SVG inside a `viewBox` narrower than the actual rendered container width. The browser scales the SVG's whole internal coordinate system (font-size included) to fill the container, so a `text-xs` (12px) label rendered visibly larger than 12px whenever the card was wider than the chart's internal coordinate space. Plain HTML/CSS with a percentage-width fill div has no such scaling step — text stays exactly the CSS size specified, and the bar still visually scales via a normal percentage width.

### Step 2: Type-check

Run `bunx tsc --noEmit`. Expected: no errors.

### Step 3: Commit

```bash
git add "src/app/(app)/quejas/ComplaintsCategoryChart.tsx"
git commit -m "fix: rebuild the Complaints category chart as HTML/CSS bars to fix oversized labels"
```

---

## Task 4: Submission page — bigger UI + photo upload

**Files:**
- Modify: `src/app/(app)/quejas/nueva/actions.ts`
- Modify: `src/app/(app)/quejas/nueva/NewComplaintForm.tsx`
- Modify: `src/app/(app)/quejas/nueva/page.tsx`

Depends on Task 1's migration (the `p_photo_path` parameter and `complaint-photos` bucket must exist for the upload to actually work at runtime; compiles without it).

- [ ] **Step 1: Read the current three files in full**

Read all three current files before editing — do not assume their contents.

- [ ] **Step 2: Rewrite `actions.ts`**

Replace the full contents of `src/app/(app)/quejas/nueva/actions.ts` with:

```typescript
"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SubmitComplaintInput {
  category: string;
  message: string;
  isAnonymous: boolean;
  photo?: File | null;
}

interface SubmitComplaintResult {
  error?: string;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function submitComplaint(input: SubmitComplaintInput): Promise<SubmitComplaintResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  if (!input.message.trim()) return { error: "El mensaje no puede estar vacío" };

  let photoPath: string | null = null;
  if (input.photo && input.photo.size > 0) {
    if (!input.photo.type.startsWith("image/")) return { error: "El archivo debe ser una imagen" };
    if (input.photo.size > MAX_PHOTO_BYTES) return { error: "La imagen no puede pesar más de 5 MB" };

    // Uploaded via the service-role admin client, regardless of whether this
    // complaint is anonymous or named - Storage would otherwise tag the
    // object's owner with the uploader's real auth.uid(), which would leak
    // identity for an anonymous submission. The path itself is a random key,
    // never derived from the uploader's id/email.
    const admin = createAdminClient();
    const extension = input.photo.type.split("/")[1] ?? "jpg";
    const path = `${randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await input.photo.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from("complaint-photos")
      .upload(path, bytes, { contentType: input.photo.type });
    if (uploadError) return { error: uploadError.message };
    photoPath = path;
  }

  const { error } = await supabase.rpc("submit_complaint", {
    p_category: input.category,
    p_message: input.message,
    p_is_anonymous: input.isAnonymous,
    p_photo_path: photoPath,
  });
  if (error) return { error: error.message };

  return {};
}
```

Before finalizing, confirm `createAdminClient` from `@/lib/supabase/admin` is the correct import (matches `src/app/mantenimiento/[token]/actions.ts`'s `saveMaintenanceSignature`, which uses the identical service-role-upload pattern — read that function again if needed for exact API shape of `.storage.from(...).upload(...)`).

- [ ] **Step 3: Update `NewComplaintForm.tsx`**

Read the current file, then apply these changes:
- Widen/enlarge: change the root container from `max-w-xl` to `max-w-3xl`; bump the category chip/button text and padding up one notch (e.g. `text-sm` → `text-base`, `px-3 py-1.5` → `px-4 py-2`); increase the textarea's `rows` from `6` to `10` and add `text-base`; increase the submit `Button`'s size (check `@/components/ui/button`'s `size` prop options — use `size="lg"` if available, otherwise add `text-base px-6 py-3` directly).
- Add photo upload: add a new piece of state `const [photo, setPhoto] = useState<File | null>(null);`, a new form section:
```tsx
<div className="space-y-1">
  <Label>Foto (opcional)</Label>
  <input
    type="file"
    accept="image/*"
    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
    className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
  />
  {photo && <p className="text-xs text-muted-foreground">Seleccionado: {photo.name}</p>}
</div>
```
placed after the message textarea and before the anonymous/named toggle. Pass `photo` through in the `submit()` function's call to `submitComplaint({ category, message, isAnonymous, photo })`. Reset `photo` to `null` alongside the other resets in the success branch.

- [ ] **Step 4: Update `page.tsx`**

Read the current file, then enlarge its heading/description similarly (e.g. `text-xl` → `text-2xl` for the `h1`, `text-sm` → `text-base` for the description paragraph), and widen the page's own wrapping padding/width if it constrains narrower than the form's new `max-w-3xl` (check — the current `<div className="p-6">` has no max-width of its own, so no change needed there beyond the heading text sizes, but verify by reading the file).

- [ ] **Step 5: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/quejas/nueva/actions.ts" "src/app/(app)/quejas/nueva/NewComplaintForm.tsx" "src/app/(app)/quejas/nueva/page.tsx"
git commit -m "feat: enlarge the Quejas submission form and add optional photo upload"
```

---

## Task 5: Photo streaming route

**Files:**
- Create: `src/app/(app)/quejas/photo/[id]/route.ts`

Depends on Task 1 (the `complaint-photos` bucket and `complaints.photo_path` column must exist at runtime; compiles without it).

- [ ] **Step 1: Write the route**

Read `src/app/(app)/(admin)/maintenance/[id]/pdf/route.ts` in full first — this is the exact pattern to copy (permission check via the session client, then stream bytes via the admin client from a private, zero-policy bucket).

Create `src/app/(app)/quejas/photo/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_complaints");
  if (!canView) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: complaint } = await supabase.from("complaints").select("photo_path").eq("id", id).single();
  if (!complaint?.photo_path) {
    return NextResponse.json({ error: "Foto no disponible" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: file, error } = await admin.storage.from("complaint-photos").download(complaint.photo_path);
  if (error || !file) {
    return NextResponse.json({ error: "No se pudo leer la foto" }, { status: 500 });
  }

  return new NextResponse(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
    },
  });
}
```

Note the permission check uses `can_view_complaints()` (this module's own gate), not `get_my_module_permissions` (that's for role-profile-based modules; complaints deliberately uses the separate per-user viewer mechanism — see `supabase/migrations/20260908100000_complaints_module.sql`).

- [ ] **Step 2: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/quejas/photo/[id]/route.ts"
git commit -m "feat: add a gated route to stream a complaint's uploaded photo"
```

---

## Task 6: Dashboard — modal detail view, triage editing, ticket number, photo display

**Files:**
- Create: `src/app/(app)/quejas/ComplaintDetailDialog.tsx`
- Create: `src/app/(app)/quejas/actions.ts`
- Modify: `src/app/(app)/quejas/ComplaintsList.tsx`
- Modify: `src/app/(app)/quejas/page.tsx`

Depends on Tasks 1 and 5 for full runtime correctness (compiles without them, since these are additive/type-safe changes against the already-existing `ComplaintRow` shape once extended).

- [ ] **Step 1: Read the current files in full**

Read `src/app/(app)/quejas/ComplaintsList.tsx` and `src/app/(app)/quejas/page.tsx` in full before editing.

- [ ] **Step 2: Write `src/app/(app)/quejas/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface UpdateComplaintStatusResult {
  error?: string;
}

export async function updateComplaintStatus(
  id: string,
  status: string,
  comment: string,
): Promise<UpdateComplaintStatusResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_complaint_status", {
    p_id: id,
    p_status: status,
    p_comment: comment,
  });
  if (error) return { error: error.message };

  revalidatePath("/quejas");
  return {};
}
```

No app-code permission check here — matches this codebase's established convention (e.g. `role-profiles/actions.ts`) of relying entirely on the RPC/RLS to reject unauthorized calls; `update_complaint_status` already raises an exception if the caller isn't a complaint viewer.

- [ ] **Step 3: Write `src/app/(app)/quejas/ComplaintDetailDialog.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateComplaintStatus } from "./actions";

const STATUS_OPTIONS = [
  { value: "nuevo", label: "Nuevo" },
  { value: "en_proceso", label: "En proceso" },
  { value: "resuelto", label: "Resuelto" },
];

const STATUS_BADGE_CLASSNAME: Record<string, string> = {
  nuevo: "",
  en_proceso: "bg-amber-100 text-amber-900 border-amber-200",
  resuelto: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export interface ComplaintDetail {
  id: string;
  complaintNumber: number;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  submitterName: string | null;
  status: string;
  reviewerComment: string | null;
  hasPhoto: boolean;
}

export function ComplaintDetailDialog({
  complaint,
  open,
  onOpenChange,
}: {
  complaint: ComplaintDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState(complaint?.status ?? "nuevo");
  const [comment, setComment] = useState(complaint?.reviewerComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!complaint) return null;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateComplaintStatus(complaint!.id, status, comment);
      if (result.error) setError(result.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setStatus(complaint.status);
          setComment(complaint.reviewerComment ?? "");
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Queja #{complaint.complaintNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{complaint.createdAtLabel}</span>
            <Badge variant="outline">{complaint.categoryLabel}</Badge>
            <span>{complaint.submitterName ?? "Anónima"}</span>
          </div>
          <p className="whitespace-pre-wrap">{complaint.message}</p>
          {complaint.hasPhoto && (
            <img
              src={`/quejas/photo/${complaint.id}`}
              alt="Foto adjunta"
              className="max-h-64 rounded-md border object-contain"
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <div className="inline-flex rounded-lg border p-1">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`rounded-md px-3 py-1.5 text-xs ${
                    status === option.value
                      ? `font-medium ${STATUS_BADGE_CLASSNAME[option.value] || "bg-muted"}`
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Comentario interno</label>
            <textarea
              className="w-full rounded-md border p-2 text-sm"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Notas internas de seguimiento..."
            />
          </div>
          <Button onClick={save} disabled={isPending}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Before finalizing, read `src/components/ui/dialog.tsx` to confirm the `Dialog` root's open-state prop is actually named `open`/`onOpenChange` (it wraps `@base-ui/react/dialog`'s `Dialog.Root` — confirm the exact prop names that component expects; adjust if the real API differs, e.g. `onOpenChange` might be named differently on this base-ui version).

- [ ] **Step 4: Update `ComplaintsList.tsx`**

Replace the full contents of `src/app/(app)/quejas/ComplaintsList.tsx` with:

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
import { ComplaintDetailDialog, type ComplaintDetail } from "./ComplaintDetailDialog";

export interface ComplaintRow {
  id: string;
  complaintNumber: number;
  createdAtLabel: string;
  categoryLabel: string;
  message: string;
  submitterName: string | null;
  status: string;
  statusLabel: string;
  reviewerComment: string | null;
  hasPhoto: boolean;
}

const STATUS_BADGE_CLASSNAME: Record<string, string> = {
  nuevo: "",
  en_proceso: "bg-amber-100 text-amber-900 border-amber-200",
  resuelto: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export function ComplaintsList({ rows }: { rows: ComplaintRow[] }) {
  const [selected, setSelected] = useState<ComplaintRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay quejas para mostrar.</p>;
  }

  const detail: ComplaintDetail | null = selected
    ? {
        id: selected.id,
        complaintNumber: selected.complaintNumber,
        createdAtLabel: selected.createdAtLabel,
        categoryLabel: selected.categoryLabel,
        message: selected.message,
        submitterName: selected.submitterName,
        status: selected.status,
        reviewerComment: selected.reviewerComment,
        hasPhoto: selected.hasPhoto,
      }
    : null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Mensaje</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => {
                setSelected(row);
                setDialogOpen(true);
              }}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (e.key === " ") e.preventDefault();
                  setSelected(row);
                  setDialogOpen(true);
                }
              }}
            >
              <TableCell className="align-top text-muted-foreground">#{row.complaintNumber}</TableCell>
              <TableCell className="align-top">{row.createdAtLabel}</TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell className="max-w-md">
                <p className="truncate">{row.message}</p>
              </TableCell>
              <TableCell className="align-top">
                <Badge variant="outline" className={STATUS_BADGE_CLASSNAME[row.status] || ""}>
                  {row.statusLabel}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ComplaintDetailDialog complaint={detail} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
```

- [ ] **Step 5: Update `page.tsx`**

Read the current full file, then apply these changes to the data-shaping section (leave the summary cards/chart/filter-bar wiring unchanged):
- Extend the `.select(...)` to also fetch `complaint_number, status, reviewer_comment, photo_path`.
- Add a `STATUS_LABELS: Record<string, string> = { nuevo: "Nuevo", en_proceso: "En proceso", resuelto: "Resuelto" };` const near `CATEGORY_LABELS`.
- Extend the `rows: ComplaintRow[]` mapping to include: `complaintNumber: c.complaint_number`, `status: c.status`, `statusLabel: STATUS_LABELS[c.status] ?? c.status`, `reviewerComment: c.reviewer_comment`, `hasPhoto: Boolean(c.photo_path)`.

- [ ] **Step 6: Type-check and run the full test suite**

Run `bunx tsc --noEmit`. Expected: no errors.
Run `bun run test`. Expected: same pre-existing "Request rate limit reached" flakiness pattern, no new failure types. Re-run `bun run test -- complaints.test.ts` in isolation to confirm 13/13.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/quejas/ComplaintDetailDialog.tsx" "src/app/(app)/quejas/actions.ts" "src/app/(app)/quejas/ComplaintsList.tsx" "src/app/(app)/quejas/page.tsx"
git commit -m "feat: switch the Complaints detail view to a modal with triage editing, ticket numbers, and photo display"
```

---

## Self-Review Notes

- **Spec coverage:** all three UI fixes (chart, modal, bigger form) map to Tasks 3/6/4 respectively. Ticket numbering/status/comment map to Tasks 1/2/6. Photo upload/display map to Tasks 1/4/5/6. The "complaints stay immutable except via a narrow function" guarantee is preserved by Task 1's design and directly tested by Task 2's new "direct update... is still rejected" test.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `ComplaintRow` (Task 6) is the single definition used by both `ComplaintsList.tsx` and `page.tsx`; `ComplaintDetail` (also Task 6) is a separate, smaller shape consumed only by the dialog, constructed from `ComplaintRow` inside `ComplaintsList.tsx`. `CategoryCount` (Task 3) is unchanged. The `status` string values (`nuevo`/`en_proceso`/`resuelto`) match exactly across the migration's check constraint (Task 1), the dialog's `STATUS_OPTIONS` (Task 6), and `page.tsx`'s `STATUS_LABELS` (Task 6).
