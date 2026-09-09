# Complaints UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required "Asunto" (subject) field to complaints, redesign the submission page so the form only opens (in a modal) when the user clicks "Crear Queja o Reporte" — with "Mis quejas" now a real table (showing status) that opens a read-only modal per row (anonymous rows never show content inline) — and redesign the review dashboard into a 3-column summary layout (totals, category breakdown, status breakdown).

**Architecture:** One new migration adds `complaints.subject` and threads it through `submit_complaint()`/`list_my_complaints()` (both require a `DROP FUNCTION` first per this codebase's established Postgres overload/return-type-change convention). `ComplaintsCategoryChart` becomes a small generic bar-list component (accepts a `title` prop) reused for both the category and status breakdowns. The submission page's form moves into a `Dialog`, triggered by a button, with "Mis quejas" as the default view.

**Tech Stack:** Next.js 16 Server Components/Actions, Supabase Postgres, TypeScript, Vitest, existing shadcn/base-ui `Dialog`/`Table`/`Badge` primitives.

**Spec:** extends `docs/superpowers/specs/2026-09-08-complaints-module-design.md` and `docs/superpowers/specs/2026-09-09-complaints-triage-and-attachments-design.md`. No new spec doc — this plan captures the (small, well-defined) design decisions directly.

---

## Task 1: Migration — `subject` column, updated RPCs

**Files:**
- Create: `supabase/migrations/20260910100000_complaints_subject.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.complaints add column if not exists subject text not null default 'Sin asunto';

-- submit_complaint's parameter list is changing (new p_subject param), so the
-- old 4-arg overload must be dropped first - CREATE OR REPLACE does not
-- replace a function whose argument type list differs (learned earlier this
-- module: 20260909100000_complaints_triage_and_attachments.sql).
drop function if exists public.submit_complaint(text, text, boolean, text);

create or replace function public.submit_complaint(
  p_category text,
  p_message text,
  p_is_anonymous boolean,
  p_photo_path text default null,
  p_subject text default 'Sin asunto'
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

  insert into public.complaints (category, message, is_anonymous, contact_id, photo_path, subject)
  values (p_category, p_message, p_is_anonymous, v_contact_id, p_photo_path, p_subject)
  returning id into v_id;

  return v_id;
end;
$$;

-- list_my_complaints' RETURNS TABLE shape is changing (new subject column) -
-- Postgres does not allow CREATE OR REPLACE FUNCTION to change a function's
-- return type/column list, so this also needs an explicit drop first.
drop function if exists public.list_my_complaints(uuid[]);

create or replace function public.list_my_complaints(p_anonymous_ids uuid[] default '{}')
returns table (
  id uuid,
  complaint_number bigint,
  created_at timestamptz,
  category text,
  subject text,
  message text,
  is_anonymous boolean,
  status text,
  reviewer_comment text,
  photo_path text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_contact_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  select c.id into v_contact_id
  from public.contacts c
  where c.email = (select au.email from public.app_users au where au.id = auth.uid());

  return query
    select
      cx.id, cx.complaint_number, cx.created_at, cx.category, cx.subject, cx.message,
      cx.is_anonymous, cx.status, cx.reviewer_comment, cx.photo_path
    from public.complaints cx
    where (v_contact_id is not null and cx.contact_id = v_contact_id)
       or (cx.is_anonymous and cx.id = any(p_anonymous_ids))
    order by cx.created_at desc;
end;
$$;
```

- [ ] **Step 2: STOP — do NOT apply this migration yourself**

Only a human pastes migration SQL into the Supabase SQL Editor. Your job ends at creating the file and committing it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260910100000_complaints_subject.sql
git commit -m "feat: add a required Asunto (subject) field to complaints"
```

---

## Task 2: Reviewer-side plumbing for `subject`

**Files:**
- Modify: `src/app/(app)/quejas/page.tsx`
- Modify: `src/app/(app)/quejas/ComplaintsList.tsx`
- Modify: `src/app/(app)/quejas/ComplaintDetailDialog.tsx`

Depends on Task 1's migration being applied for full runtime correctness; compiles without it.

- [ ] **Step 1: Read all three files in full**

- [ ] **Step 2: `page.tsx`**

Extend the `.select(...)` string to also fetch `subject`. Add `subject: c.subject` to the `rows: ComplaintRow[]` mapping.

- [ ] **Step 3: `ComplaintsList.tsx`**

Add `subject: string;` to the `ComplaintRow` interface. In the table, add a new `<TableHead>Asunto</TableHead>` / `<TableCell>{row.subject}</TableCell>` column, positioned between "Categoría" and "Mensaje". Pass `subject: row.subject` into the `ComplaintDetail` object built for the dialog.

- [ ] **Step 4: `ComplaintDetailDialog.tsx`**

Add `subject: string;` to the `ComplaintDetail` interface. Change the `DialogTitle` from `Queja #{complaint.complaintNumber}` to `Queja #{complaint.complaintNumber} — {complaint.subject}`.

- [ ] **Step 5: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/quejas/page.tsx" "src/app/(app)/quejas/ComplaintsList.tsx" "src/app/(app)/quejas/ComplaintDetailDialog.tsx"
git commit -m "feat: show the complaint subject on the review dashboard"
```

---

## Task 3: Dashboard — 3-column summary layout

**Files:**
- Modify: `src/app/(app)/quejas/ComplaintsSummaryCards.tsx`
- Modify: `src/app/(app)/quejas/ComplaintsCategoryChart.tsx`
- Modify: `src/app/(app)/quejas/page.tsx`

Independent of Tasks 1/2 (though it touches `page.tsx`, a different region of the file — if executed after Task 2, re-read the current file first).

- [ ] **Step 1: Read all three files in full**

- [ ] **Step 2: `ComplaintsSummaryCards.tsx`**

Change the root `<div>`'s className from `"grid grid-cols-1 gap-4 sm:grid-cols-3"` to `"grid grid-cols-1 gap-4"` (always a single vertical column — it's now meant to sit as one column among three on the dashboard, not its own full-width row).

- [ ] **Step 3: `ComplaintsCategoryChart.tsx`**

Add an optional `title` prop, defaulting to the current hardcoded text, so the same component can be reused for a status breakdown with a different heading:

```tsx
export interface CategoryCount {
  category: string;
  label: string;
  count: number;
}

export function ComplaintsCategoryChart({
  counts,
  title = "Quejas por categoría",
}: {
  counts: CategoryCount[];
  title?: string;
}) {
  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <div className="rounded-2xl border p-5">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="space-y-2">
        {counts.map((c) => (
          <div key={c.category} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{c.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
              <div className="h-6 rounded bg-[#04B1AF]" style={{ width: `${(c.count / max) * 100}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right text-xs font-medium">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx`**

Read the CURRENT file (it may already have Task 2's `subject` changes applied — preserve them). Add a `STATUS_ORDER = ["nuevo", "en_proceso", "resuelto", "declinada"];` const, and compute:

```ts
const statusCounts = STATUS_ORDER.map((value) => ({
  category: value,
  label: STATUS_LABELS[value] ?? value,
  count: allComplaints.filter((c) => c.status === value).length,
}));
```

Change the JSX region that currently renders `<ComplaintsSummaryCards summary={summary} /><ComplaintsCategoryChart counts={categoryCounts} />` to:

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
  <ComplaintsSummaryCards summary={summary} />
  <ComplaintsCategoryChart counts={categoryCounts} title="Quejas por categoría" />
  <ComplaintsCategoryChart counts={statusCounts} title="Quejas por estado" />
</div>
```

(Everything else on the page — filter bar, table — stays below this grid, unchanged.)

- [ ] **Step 5: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/quejas/ComplaintsSummaryCards.tsx" "src/app/(app)/quejas/ComplaintsCategoryChart.tsx" "src/app/(app)/quejas/page.tsx"
git commit -m "feat: redesign the Quejas dashboard summary into a 3-column layout with a status breakdown"
```

---

## Task 4: Submission-side actions — `subject` plumbing

**Files:**
- Modify: `src/app/(app)/quejas/nueva/actions.ts`

Depends on Task 1's migration for full runtime correctness; compiles without it.

- [ ] **Step 1: Read the current file in full**

- [ ] **Step 2: Add `subject` everywhere it's needed**

- Add `subject: string;` to `SubmitComplaintInput`.
- Add `subject: string;` to `MyComplaintRow`.
- In `submitComplaint`, validate `if (!input.subject.trim()) return { error: "El asunto no puede estar vacío" };` (alongside the existing message-empty check), and pass `p_subject: input.subject` in the `supabase.rpc("submit_complaint", {...})` call.
- In the notification-email block, nothing needs to change (the email doesn't currently show subject — leave as-is, out of scope for this task).
- In `listMyComplaints`'s row mapping, add `subject: c.subject` and update the inline type annotation on the `.map(...)` callback parameter to include `subject: string`.

- [ ] **Step 3: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/quejas/nueva/actions.ts"
git commit -m "feat: add the required Asunto field to complaint submission and self-lookup"
```

---

## Task 5: Submission page redesign — button-triggered modal form

**Files:**
- Modify: `src/app/(app)/quejas/nueva/NewComplaintForm.tsx`
- Modify: `src/app/(app)/quejas/nueva/page.tsx` (only if needed after reading)

Depends on Task 4 (the `subject` field) being in place in `actions.ts` — run Task 4 before this one.

- [ ] **Step 1: Read the current `NewComplaintForm.tsx` and `page.tsx` in full**

- [ ] **Step 2: Restructure `NewComplaintForm.tsx`**

Wrap the existing form fields in a `Dialog` (`@/components/ui/dialog`), triggered by a "Crear Queja o Reporte" button. The default view (dialog closed) shows just the button + `MyComplaintsList`. Add `Asunto` as a new required text `Input` field, positioned above "Categoría". On successful submission, close the dialog (instead of showing an inline success banner) — a closed dialog + the "Mis quejas" table updating (via `refreshKey`) IS the success feedback, so the modal doesn't need its own "success" sub-state.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitComplaint } from "./actions";
import { MyComplaintsList, rememberAnonymousComplaintId } from "./MyComplaintsList";

const CATEGORIES = [
  { value: "acoso", label: "Acoso" },
  { value: "seguridad", label: "Seguridad" },
  { value: "etica", label: "Ética" },
  { value: "recursos_humanos", label: "Recursos Humanos" },
  { value: "otro", label: "Otro" },
];

export function NewComplaintForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("otro");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!subject.trim()) {
      setError("Escribe un asunto antes de enviar.");
      return;
    }
    if (!message.trim()) {
      setError("Escribe un mensaje antes de enviar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitComplaint({ subject, category, message, isAnonymous, photo });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id && result.isAnonymous) {
        rememberAnonymousComplaintId(result.id);
      }
      setSubject("");
      setMessage("");
      setCategory("otro");
      setPhoto(null);
      setPhotoInputKey((k) => k + 1);
      setIsAnonymous(true);
      setRefreshKey((k) => k + 1);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="lg">Crear Queja o Reporte</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Enviar queja o reporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-1">
              <Label>Asunto</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Un resumen breve..." />
            </div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`rounded-lg border px-4 py-2 text-base ${
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
                className="w-full rounded-md border p-2 text-base"
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe lo que quieres reportar..."
              />
            </div>
            <div className="space-y-1">
              <Label>Foto (opcional)</Label>
              <input
                key={photoInputKey}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file && file.size > 5 * 1024 * 1024) {
                    setError("La imagen no puede pesar más de 5 MB");
                    setPhoto(null);
                    e.target.value = "";
                    return;
                  }
                  setError(null);
                  setPhoto(file);
                }}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
              {photo && <p className="text-xs text-muted-foreground">Seleccionado: {photo.name}</p>}
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
                    className={`rounded-md px-4 py-2 text-base ${
                      isAnonymous === option.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" onClick={submit} disabled={isPending}>
              Enviar queja
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <MyComplaintsList refreshKey={refreshKey} />
    </>
  );
}
```

Before finalizing, read `src/components/ui/dialog.tsx` to confirm `DialogTrigger` accepts an `asChild`-equivalent prop (check the actual base-ui API — this codebase's `Dialog` wraps `@base-ui/react/dialog`; confirm the exact prop name/pattern for "render the trigger as this child element" by checking an existing `DialogTrigger` usage elsewhere in this codebase, e.g. `NewVacationRequestDialog.tsx` or `DeleteRoleProfileDialog.tsx`, and adjust if the real API differs from React's common `asChild` convention).

- [ ] **Step 3: Check `page.tsx`**

Read the current file — confirm it still makes sense with the new button-triggered design (likely just needs its heading/intro text adjusted slightly, e.g. removing "Puedes enviarla de forma anónima o con tu nombre" from the top-level page description if that now reads oddly above a button rather than above a form — use your judgment, keep it minimal).

- [ ] **Step 4: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/quejas/nueva/NewComplaintForm.tsx" "src/app/(app)/quejas/nueva/page.tsx"
git commit -m "feat: open the complaint submission form in a modal, triggered by a button"
```

---

## Task 6: "Mis quejas" as a table with a read-only detail modal

**Files:**
- Modify: `src/app/(app)/quejas/nueva/MyComplaintsList.tsx`
- Create: `src/app/(app)/quejas/nueva/MyComplaintDetailDialog.tsx`

Depends on Task 4 (the `subject` field in `MyComplaintRow`/`listMyComplaints`).

- [ ] **Step 1: Read the current `MyComplaintsList.tsx` in full**

- [ ] **Step 2: Write `MyComplaintDetailDialog.tsx`**

A read-only modal (no status/comment editing — this is the submitter's own view, not the reviewer's):

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { MyComplaintRow } from "./actions";

export function MyComplaintDetailDialog({
  complaint,
  open,
  onOpenChange,
}: {
  complaint: MyComplaintRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!complaint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Queja #{complaint.complaintNumber} — {complaint.subject}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{complaint.createdAtLabel}</span>
            <Badge variant="outline">{complaint.categoryLabel}</Badge>
            <Badge variant="outline">{complaint.statusLabel}</Badge>
            {complaint.isAnonymous && <Badge variant="outline">Anónima</Badge>}
          </div>
          <p className="whitespace-pre-wrap">{complaint.message}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Rewrite `MyComplaintsList.tsx`**

Replace the `<ul>` of cards with a real `<Table>`. Every row shows only metadata (no message/subject content inline, for either anonymous or named rows — clicking is the only way to see the full content, keeping the table compact and consistent for both cases). An anonymous row gets a small "Anónima" `Badge` so it's visually distinguishable; clicking ANY row (anonymous or named) opens `MyComplaintDetailDialog` with the full content.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listMyComplaints, type MyComplaintRow } from "./actions";
import { MyComplaintDetailDialog } from "./MyComplaintDetailDialog";

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
  const [selected, setSelected] = useState<MyComplaintRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const anonymousIds = getStoredAnonymousComplaintIds();
    listMyComplaints(anonymousIds)
      .then(setRows)
      .catch(() => setRows([]));
  }, [refreshKey]);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return (
    <div className="mt-8 space-y-2">
      <p className="text-sm font-semibold">Mis quejas</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
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
              <TableCell className="text-muted-foreground">#{row.complaintNumber}</TableCell>
              <TableCell>{row.createdAtLabel}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.categoryLabel}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{row.statusLabel}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {row.isAnonymous && <Badge variant="outline">Anónima</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MyComplaintDetailDialog
        key={selected?.id ?? "none"}
        complaint={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
```

Note the `key={selected?.id ?? "none"}` on the dialog — same pattern already used for `ComplaintDetailDialog` on the reviewer side, to force a clean remount per-row rather than relying on the open/close transition edge (a lesson already learned and fixed once in this module).

- [ ] **Step 4: Type-check**

Run `bunx tsc --noEmit`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/quejas/nueva/MyComplaintsList.tsx" "src/app/(app)/quejas/nueva/MyComplaintDetailDialog.tsx"
git commit -m "feat: show Mis quejas as a table with a read-only detail modal"
```

---

## Task 7: Integration tests for `subject`

**Files:**
- Modify: `src/test/integration/complaints.test.ts`

Depends on Task 1's migration being applied (confirmed by the human).

- [ ] **Step 1: Read the current file in full**

- [ ] **Step 2: Update existing `submit_complaint` calls and add a new test**

Every existing `.rpc("submit_complaint", {...})` call in this file that doesn't pass `p_subject` will now get the default `'Sin asunto'` — that's fine and requires no changes to existing tests (the default keeps them working). Add one new test:

```typescript
it("submit_complaint stores the provided subject, and list_my_complaints returns it", async () => {
  viewer = await createTestUser("Viewer");

  const { data: id, error } = await viewer.client.rpc("submit_complaint", {
    p_category: "otro",
    p_message: "Mensaje de prueba",
    p_is_anonymous: true,
    p_subject: "Asunto de prueba",
  });
  expect(error).toBeNull();
  complaintIds.push(id as string);

  const { data: rows } = await viewer.client.rpc("list_my_complaints", { p_anonymous_ids: [id] });
  const row = rows?.find((r: { id: string }) => r.id === id);
  expect(row?.subject).toBe("Asunto de prueba");
});
```

- [ ] **Step 3: Run the tests**

Run: `bun run test -- complaints.test.ts`
Expected: PASS (16 tests total: the existing 15 plus this new one).

- [ ] **Step 4: Commit**

```bash
git add src/test/integration/complaints.test.ts
git commit -m "test: cover the subject field on submit_complaint and list_my_complaints"
```

---

## Self-Review Notes

- **Spec coverage:** Asunto field → Tasks 1/4/5/7. Form-only-opens-via-button → Task 5. Mis quejas as a table with status column → Task 6. Anonymous always hidden, single click reveals via modal → Task 6 (no inline content for anonymous OR named rows; click opens modal for both, matching the user's literal request that "para ver la solicitud completa... deberia verse en un modal" applies to viewing in general). Dashboard 3-column layout (totals / category / status breakdown) → Task 3. Reviewer also sees subject → Task 2.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `MyComplaintRow` (defined in `nueva/actions.ts`, extended in Task 4) is imported unchanged by `MyComplaintsList.tsx` and `MyComplaintDetailDialog.tsx` in Task 6. `ComplaintRow`/`ComplaintDetail` (reviewer side) extended identically in Task 2. `CategoryCount` (Task 3) stays generic and is reused for both category and status breakdowns with no shape change.
