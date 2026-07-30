# Birthdays Coverflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain text list in the home page's "Próximos cumpleaños" widget with a small 3D coverflow carousel showing each of the next 5 birthday contacts' photo (or initials) with their name and date below, auto-advancing every 5 minutes, clickable through to the contact's profile.

**Architecture:** Add `photo_url` to the `BirthdayContact` type and thread it through the home page's query. Move the existing `isTodayBirthday` helper into `src/lib/contacts.ts` (currently private to `BirthdaysWidget.tsx`) and add a new `getInitials` helper alongside it, both unit-tested. Build a new client component `BirthdaysCoverflow.tsx` containing fixed (non-configurable) 3D coverflow positioning math, and have `BirthdaysWidget.tsx` render it in place of its old `<ul>`.

**Tech Stack:** Next.js 16 App Router, React client component (`useState`/`useEffect`), Tailwind, existing `Avatar`/`AvatarImage`/`AvatarFallback` components, `next/link`.

Reference spec: `docs/superpowers/specs/2026-07-30-birthdays-coverflow-design.md`

---

### Task 1: Add `photo_url`, `isTodayBirthday`, and `getInitials` to `src/lib/contacts.ts`

**Files:**
- Modify: `src/lib/contacts.ts`
- Test: `src/lib/contacts.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these two new `describe` blocks to the end of `src/lib/contacts.test.ts` (after the existing `formatMonthDay` block, before end of file). Also update the import line at the top of the file.

Change the import at the top of `src/lib/contacts.test.ts` from:

```typescript
import {
  buildOrgTree,
  escapeIlikePattern,
  formatMonthDay,
  getUpcomingBirthdays,
  whatsappUrl,
} from "./contacts";
```

to:

```typescript
import {
  buildOrgTree,
  escapeIlikePattern,
  formatMonthDay,
  getInitials,
  getUpcomingBirthdays,
  isTodayBirthday,
  whatsappUrl,
} from "./contacts";
```

Then append at the end of the file:

```typescript
describe("isTodayBirthday", () => {
  it("returns true when month and day match today (UTC)", () => {
    const today = new Date("2026-07-14T12:00:00Z");
    expect(isTodayBirthday("1990-07-14", today)).toBe(true);
  });

  it("returns false when month or day don't match today", () => {
    const today = new Date("2026-07-14T12:00:00Z");
    expect(isTodayBirthday("1990-07-15", today)).toBe(false);
    expect(isTodayBirthday("1990-08-14", today)).toBe(false);
  });

  it("returns false for a null birth date", () => {
    expect(isTodayBirthday(null)).toBe(false);
  });
});

describe("getInitials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(getInitials("James Walker")).toBe("JW");
  });

  it("handles a single-word name", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("ignores extra whitespace between words", () => {
    expect(getInitials("  Ana   Torres  ")).toBe("AT");
  });

  it("returns an empty string for an empty name", () => {
    expect(getInitials("")).toBe("");
  });
});
```

Also update the four existing `getUpcomingBirthdays` test cases so their contact literals satisfy the `BirthdayContact` type once `photo_url` becomes a required field. In each of the 4 `it(...)` blocks under `describe("getUpcomingBirthdays", ...)`, add `photo_url: null` to every contact object literal. For example, change:

```typescript
{ id: "1", name: "A", birth_date: "1990-07-20" },
```

to:

```typescript
{ id: "1", name: "A", birth_date: "1990-07-20", photo_url: null },
```

Do this for all contact literals in all 4 tests in that `describe` block (ids `"1"` through `"6"` across the 4 tests).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: FAIL — `isTodayBirthday` and `getInitials` are not exported yet (import error), and/or type errors from the missing `photo_url` field once TypeScript checks the file.

- [ ] **Step 3: Implement `photo_url`, `isTodayBirthday`, and `getInitials`**

In `src/lib/contacts.ts`, change the `BirthdayContact` interface (currently lines 1-5) from:

```typescript
export interface BirthdayContact {
  id: string;
  name: string;
  birth_date: string | null;
}
```

to:

```typescript
export interface BirthdayContact {
  id: string;
  name: string;
  birth_date: string | null;
  photo_url: string | null;
}
```

Then add these two new functions at the end of the file (after `formatMonthDay`):

```typescript
export function isTodayBirthday(birthDate: string | null, today: Date = new Date()): boolean {
  if (!birthDate) return false;
  const [, month, day] = birthDate.split("-").map(Number);
  return month === today.getUTCMonth() + 1 && day === today.getUTCDate();
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: PASS (all tests in the file, including the 4 pre-existing `getUpcomingBirthdays` tests and the 7 new ones)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (This will surface any other file that constructs a `BirthdayContact` literal without `photo_url` — the only other place is `src/app/(app)/page.tsx`, fixed in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/contacts.ts src/lib/contacts.test.ts
git commit -m "feat: add photo_url to BirthdayContact, isTodayBirthday and getInitials helpers"
```

---

### Task 2: Thread `photo_url` through the home page query

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Update the query and mapping**

In `src/app/(app)/page.tsx`, change:

```typescript
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, birth_date")
      .eq("status", "active");

    birthdayContacts = getUpcomingBirthdays(
      (contacts ?? []).map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        birth_date: c.birth_date,
      })),
      new Date(),
      5,
    );
```

to:

```typescript
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, birth_date, photo_url")
      .eq("status", "active");

    birthdayContacts = getUpcomingBirthdays(
      (contacts ?? []).map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        birth_date: c.birth_date,
        photo_url: c.photo_url,
      })),
      new Date(),
      5,
    );
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: fetch photo_url for upcoming birthdays"
```

---

### Task 3: `BirthdaysCoverflow` component

**Files:**
- Create: `src/app/(app)/contacts/BirthdaysCoverflow.tsx`

- [ ] **Step 1: Write the component**

Create `src/app/(app)/contacts/BirthdaysCoverflow.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMonthDay, getInitials, isTodayBirthday, type BirthdayContact } from "@/lib/contacts";

const PERSPECTIVE = 900;
const SCALE_STEP = 0.22;
const MAX_VISIBLE = 2;
const DEPTH = 70;
const STEP_X = 62;
const TILT = 10;
const AUTOPLAY_MS = 5 * 60 * 1000;
const TRANSITION = "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)";

export function BirthdaysCoverflow({ contacts }: { contacts: BirthdayContact[] }) {
  const n = contacts.length;
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive((a) => Math.max(0, Math.min(n - 1, a)));
  }, [n]);

  useEffect(() => {
    if (n < 2) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % n);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [n]);

  if (n === 0) return null;

  return (
    <div
      className="relative flex h-44 items-center justify-center"
      style={{ perspective: `${PERSPECTIVE}px` }}
    >
      <div className="relative size-full" style={{ transformStyle: "preserve-3d" }}>
        {contacts.map((c, i) => {
          let rel = i - active;
          if (rel > n / 2) rel -= n;
          if (rel < -n / 2) rel += n;
          const ax = Math.abs(rel);
          const visible = ax <= MAX_VISIBLE;
          const isActive = rel === 0;
          const scale = Math.max(0.5, 1 - ax * SCALE_STEP);
          const tx = rel * STEP_X;
          const tz = -ax * DEPTH;
          const ry = -rel * TILT;
          const today = isTodayBirthday(c.birth_date);

          return (
            <Link
              key={c.id}
              href={`/contacts/${c.id}`}
              aria-label={c.name}
              aria-hidden={!visible}
              tabIndex={visible ? 0 : -1}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
                transition: TRANSITION,
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
              }}
              className="flex flex-col items-center gap-1"
            >
              <Avatar
                className={`size-20 border-2 shadow-md ${isActive ? "border-[#04B1AF]" : "border-background"}`}
              >
                <AvatarImage src={c.photo_url ?? undefined} alt="" />
                <AvatarFallback className="text-base">{getInitials(c.name)}</AvatarFallback>
              </Avatar>
              <span className="max-w-[110px] truncate text-xs font-medium">{c.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {c.birth_date ? formatMonthDay(c.birth_date) : ""}
              </span>
              {today && (
                <span className="animate-pulse rounded-full bg-[#04B1AF] px-1.5 py-0.5 text-[10px] font-medium text-white">
                  ¡Hoy!
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/contacts/BirthdaysCoverflow.tsx"
git commit -m "feat: add BirthdaysCoverflow carousel component"
```

---

### Task 4: Wire `BirthdaysWidget` to use the coverflow

**Files:**
- Modify: `src/app/(app)/contacts/BirthdaysWidget.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the full contents of `src/app/(app)/contacts/BirthdaysWidget.tsx` (currently a `Cake` icon import, a local `isTodayBirthday` function, and a `<ul>` of text rows) with:

```tsx
import { Cake } from "lucide-react";
import type { BirthdayContact } from "@/lib/contacts";
import { BirthdaysCoverflow } from "./BirthdaysCoverflow";

export function BirthdaysWidget({ contacts }: { contacts: BirthdayContact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-gradient-to-br from-[#04B1AF]/10 via-white to-emerald-50 p-5 shadow-sm duration-700 dark:via-transparent">
      <div
        aria-hidden
        className="animate-blob absolute -top-10 -right-10 size-32 rounded-full bg-[#04B1AF]/10 blur-2xl"
      />
      <div className="relative mb-3 flex items-center gap-2 font-semibold">
        <span className="flex size-8 shrink-0 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
          <Cake className="size-4" />
        </span>
        Próximos cumpleaños
      </div>
      <BirthdaysCoverflow contacts={contacts} />
    </div>
  );
}
```

Note: `formatMonthDay` is no longer imported here — it moved into `BirthdaysCoverflow.tsx`, which is the only place it's still needed in this widget.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/contacts/BirthdaysWidget.tsx"
git commit -m "feat: render BirthdaysCoverflow inside BirthdaysWidget"
```

---

### Task 5: Full regression pass and manual visual check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass except the 2 known pre-existing, unrelated failures in `src/test/integration/roleProfiles.test.ts` (module-count mismatch from an unrelated in-progress "maintenance module" feature — confirmed pre-existing before this work started).

- [ ] **Step 2: Manual visual check**

Start the dev server (`npm run dev`), open the home page (`/`) as a logged-in user with `can_view` on the `contacts` module and at least 2 contacts with upcoming birthdays. Confirm:
- The "Próximos cumpleaños" card shows a 3D coverflow carousel instead of a text list.
- Each visible card shows a photo (or initials if no `photo_url`), the contact's name, and their birthday date below the name.
- If a contact's birthday is today, the "¡Hoy!" badge appears under their card.
- Clicking any visible card (not just the centered one) navigates to that contact's `/contacts/[id]` page.
- Leave the page open for 5 minutes (or temporarily lower `AUTOPLAY_MS` locally to confirm, then revert) and confirm the carousel advances on its own.

- [ ] **Step 3: Commit (only if fixes were needed)**

If the manual check surfaced issues and you fixed them, commit each fix individually with a descriptive message. If nothing needed fixing, skip this step.
