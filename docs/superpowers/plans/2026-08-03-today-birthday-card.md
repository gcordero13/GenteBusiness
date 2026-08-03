# Today Birthday Card + Contact Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone, confetti-animated "Hoy cumple años" card to the home page for whoever's birthday is today, and replace the birthday carousel's "click photo → navigate to contact page" behavior with a shared read-only modal (no edit button) on both the new card and the existing "Próximos cumpleaños" carousel.

**Architecture:** Extend the existing `BirthdayContact` type and home-page query with the extra fields the modal needs (position, email, extension, fleet phone, company, department — all already columns on `contacts`, no migration needed). A new pure function `splitTodayBirthdays` partitions the fetched contacts into "today" vs. "everyone else" before the existing `getUpcomingBirthdays` runs on the remainder, so nobody appears in both the new card and the existing carousel. Two new client components (`TodayBirthdayCard`, `BirthdayContactModal`) plus a small edit to the existing carousel wire it all together; no new dependencies (confetti is CSS keyframes + generated `<span>`s, matching the codebase's existing animation conventions).

**Tech Stack:** Next.js 16 App Router (Server Component data fetching + client components), Tailwind CSS v4, Vitest.

**Spec:** [docs/superpowers/specs/2026-08-03-today-birthday-card-design.md](../specs/2026-08-03-today-birthday-card-design.md)

---

## Task 1: Extend `BirthdayContact` + add `splitTodayBirthdays`

**Files:**
- Modify: `src/lib/contacts.ts`
- Create: `src/lib/contacts.test.ts` (this file doesn't exist yet — the functions in `contacts.ts` currently have no tests)

- [ ] **Step 1: Write the failing test**

Create `src/lib/contacts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { splitTodayBirthdays, type BirthdayContact } from "./contacts";

function contact(overrides: Partial<BirthdayContact> = {}): BirthdayContact {
  return {
    id: "1",
    name: "Ana García",
    birth_date: "2000-01-01",
    photo_url: null,
    position: null,
    email: null,
    extension: null,
    fleet_phone: null,
    has_whatsapp: false,
    company_name: null,
    department_name: null,
    ...overrides,
  };
}

describe("splitTodayBirthdays", () => {
  it("puts a contact whose birthday is today into todayBirthdays", () => {
    const today = new Date("2026-08-03T12:00:00Z");
    const c = contact({ id: "1", birth_date: "1990-08-03" });

    const { todayBirthdays, rest } = splitTodayBirthdays([c], today);

    expect(todayBirthdays).toEqual([c]);
    expect(rest).toEqual([]);
  });

  it("puts a contact whose birthday isn't today into rest", () => {
    const today = new Date("2026-08-03T12:00:00Z");
    const c = contact({ id: "2", birth_date: "1990-12-25" });

    const { todayBirthdays, rest } = splitTodayBirthdays([c], today);

    expect(todayBirthdays).toEqual([]);
    expect(rest).toEqual([c]);
  });

  it("puts a contact with no birth_date into rest", () => {
    const today = new Date("2026-08-03T12:00:00Z");
    const c = contact({ id: "3", birth_date: null });

    const { todayBirthdays, rest } = splitTodayBirthdays([c], today);

    expect(todayBirthdays).toEqual([]);
    expect(rest).toEqual([c]);
  });

  it("never puts the same contact in both groups, across a mixed list", () => {
    const today = new Date("2026-08-03T12:00:00Z");
    const a = contact({ id: "1", birth_date: "1990-08-03" });
    const b = contact({ id: "2", birth_date: "1990-12-25" });

    const { todayBirthdays, rest } = splitTodayBirthdays([a, b], today);

    expect(todayBirthdays.map((c) => c.id)).toEqual(["1"]);
    expect(rest.map((c) => c.id)).toEqual(["2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: FAIL — `splitTodayBirthdays` isn't exported yet, and `BirthdayContact` doesn't have the new fields yet (TypeScript error on the `contact()` helper's object literal).

- [ ] **Step 3: Write the implementation**

In `src/lib/contacts.ts`, replace the `BirthdayContact` interface with:

```typescript
export interface BirthdayContact {
  id: string;
  name: string;
  birth_date: string | null;
  photo_url: string | null;
  position: string | null;
  email: string | null;
  extension: string | null;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  company_name: string | null;
  department_name: string | null;
}
```

Add this function right after `isTodayBirthday` (which it depends on):

```typescript
export function splitTodayBirthdays<T extends BirthdayContact>(
  contacts: T[],
  today: Date,
): { todayBirthdays: T[]; rest: T[] } {
  const todayBirthdays: T[] = [];
  const rest: T[] = [];
  for (const contact of contacts) {
    if (isTodayBirthday(contact.birth_date, today)) {
      todayBirthdays.push(contact);
    } else {
      rest.push(contact);
    }
  }
  return { todayBirthdays, rest };
}
```

Nothing else in the file changes — `getUpcomingBirthdays`, `whatsappUrl`, `formatMonthDay`, `isTodayBirthday`, `getInitials`, `buildOrgTree`, `escapeIlikePattern` are all untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contacts.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite to check for fallout**

Run: `npm run test`
Expected: any pre-existing consumer of `BirthdayContact` that constructs one as an object literal (rather than through the type alone) will now show a type error if it doesn't supply the new fields — check `npx tsc --noEmit` output specifically. At this point in the plan, `src/app/(app)/page.tsx` is the only such consumer (built in Task 6) and is expected to show an error until Task 6 lands; this is fine and matches this plan's task boundaries — don't fix it here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contacts.ts src/lib/contacts.test.ts
git commit -m "feat: add splitTodayBirthdays and extend BirthdayContact with modal fields"
```

---

## Task 2: Confetti-fall CSS animation

**Files:**
- Modify: `src/app/globals.css`

No test file — this is a CSS-only change, consistent with how the existing `animate-blob`/`blob-float` animation in the same file has no test coverage either.

- [ ] **Step 1: Add the keyframes and animation class**

In `src/app/globals.css`, right after the existing `.animate-blob-delayed` rule, add:

```css
@keyframes confetti-fall {
  0% {
    transform: translateY(-10%) rotate(0deg);
  }
  100% {
    transform: translateY(340px) rotate(360deg);
  }
}

.animate-confetti-fall {
  animation: confetti-fall linear infinite;
}
```

Then update the existing `prefers-reduced-motion` block right below it to also disable this new animation — change:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-blob,
  .animate-blob-delayed {
    animation: none;
  }
}
```

to:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-blob,
  .animate-blob-delayed,
  .animate-confetti-fall {
    animation: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add a confetti-fall CSS animation"
```

---

## Task 3: `BirthdayContactModal` component

**Files:**
- Create: `src/app/(app)/contacts/BirthdayContactModal.tsx`

No test file expected — this mirrors the existing `ContactViewDialog.tsx` in the same directory, which also has no test file (visual dialog components in this codebase are verified manually).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Cake, Mail, Phone } from "lucide-react";
import { formatMonthDay, getInitials, whatsappUrl, type BirthdayContact } from "@/lib/contacts";

export function BirthdayContactModal({
  contact,
  trigger,
}: {
  contact: BirthdayContact;
  trigger: ReactElement;
}) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{contact.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-5 p-2">
          <Avatar className="size-24">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-2xl">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-foreground">{contact.name}</p>
            {contact.position && <p className="text-muted-foreground">{contact.position}</p>}
            <p className="text-muted-foreground">
              {contact.company_name}
              {contact.company_name && contact.department_name ? " · " : ""}
              {contact.department_name}
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Cake className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Cumpleaños</p>
              <p className="font-medium">
                {contact.birth_date ? formatMonthDay(contact.birth_date) : "-"}
              </p>
            </div>
          </div>
          {contact.email && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Mail className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Correo</p>
                <a href={`mailto:${contact.email}`} className="font-medium underline underline-offset-2">
                  {contact.email}
                </a>
              </div>
            </div>
          )}
          {contact.extension && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Phone className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Extensión</p>
                <p className="font-medium">{contact.extension}</p>
              </div>
            </div>
          )}
          {contact.fleet_phone && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Phone className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Teléfono / Flota</p>
                <p className="font-medium">
                  {contact.fleet_phone}
                  {contact.has_whatsapp && (
                    <a
                      href={whatsappUrl(contact.fleet_phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-sm underline underline-offset-2"
                    >
                      WhatsApp
                    </a>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Note the `trigger` prop (a `ReactElement`, passed straight to `DialogTrigger render={trigger}`) rather than a `children` prop wrapped in a fixed `<button>` (the pattern `ContactViewDialog.tsx` uses) — this component's two callers (Task 4 and Task 5) each need to control the exact trigger element themselves (one needs absolute-positioning styles for the 3D carousel, the other needs the confetti card's own layout), so the caller must own the full trigger markup rather than only supplying its inner content.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this component isn't used anywhere yet, so nothing else should change).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/contacts/BirthdayContactModal.tsx"
git commit -m "feat: add BirthdayContactModal"
```

---

## Task 4: `TodayBirthdayCard` component

**Files:**
- Create: `src/app/(app)/contacts/TodayBirthdayCard.tsx`

No test file expected — this is a visual, animated client component; verified manually, consistent with `BirthdaysCoverflow.tsx`'s existing precedent (also untested).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, type BirthdayContact } from "@/lib/contacts";
import { BirthdayContactModal } from "./BirthdayContactModal";

const AUTOPLAY_MS = 4 * 1000;
const CONFETTI_COLORS = ["#ffffff", "#fde68a", "#fca5a5", "#93c5fd", "#c4b5fd", "#fbcfe8"];
const CONFETTI_COUNT = 24;

interface ConfettiPiece {
  left: number;
  color: string;
  delay: number;
  duration: number;
}

export function TodayBirthdayCard({ contacts }: { contacts: BirthdayContact[] }) {
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

  const confettiPieces = useMemo<ConfettiPiece[]>(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 2,
        duration: 1.8 + Math.random() * 1.4,
      })),
    [],
  );

  if (n === 0) return null;

  const contact = contacts[active];

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#04B1AF] to-emerald-500 p-8 text-center shadow-md">
      {confettiPieces.map((piece, i) => (
        <span
          key={i}
          aria-hidden
          className="animate-confetti-fall absolute top-[-10%] h-3.5 w-2 opacity-90"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
      <BirthdayContactModal
        contact={contact}
        trigger={
          <button type="button" className="relative z-10 flex w-full flex-col items-center gap-1 text-left">
            <Avatar className="size-40 border-4 border-white shadow-lg">
              <AvatarImage src={contact.photo_url ?? undefined} alt="" />
              <AvatarFallback className="bg-white text-4xl text-black">
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <span className="mt-2 max-w-[260px] text-lg font-bold text-black">{contact.name}</span>
            {contact.position && <span className="text-sm text-gray-800">{contact.position}</span>}
            <span className="mt-1 rounded-full border border-white/50 bg-white/20 px-3 py-1 text-xs font-bold text-white">
              🎉 ¡Hoy cumple años!
            </span>
          </button>
        }
      />
      {n > 1 && (
        <div className="relative z-10 mt-3 flex justify-center gap-1.5">
          {contacts.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Ver a ${c.name}`}
              onClick={() => setActive(i)}
              className={`size-1.5 rounded-full transition-colors ${
                i === active ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

The `key={i}` on the confetti `<span>` elements is fine here (the list is generated once via `useMemo` with a stable length and never reordered/filtered, so index-as-key has none of the usual pitfalls).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (this component isn't used anywhere yet either).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/contacts/TodayBirthdayCard.tsx"
git commit -m "feat: add TodayBirthdayCard with confetti animation"
```

---

## Task 5: `BirthdaysCoverflow` uses the modal instead of navigating

**Files:**
- Modify: `src/app/(app)/contacts/BirthdaysCoverflow.tsx`

- [ ] **Step 1: Replace the `Link` import and the per-item trigger**

Replace the `import Link from "next/link";` line with:

```typescript
import { BirthdayContactModal } from "./BirthdayContactModal";
```

Replace the `<Link ...>...</Link>` block (the one keyed by `c.id`, currently wrapping the `<Avatar>` and the active-item name/date/badge block) with:

```tsx
              <BirthdayContactModal
                key={c.id}
                contact={c}
                trigger={
                  <button
                    type="button"
                    aria-label={c.name}
                    aria-hidden={!visible}
                    tabIndex={visible ? 0 : -1}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: `translate(-50%, -50%) translateX(${tx}px) translateY(${ty}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
                      filter: aboutToWrap ? "blur(6px)" : "blur(0px)",
                      transition: TRANSITION,
                      opacity: visible ? 1 : 0,
                      pointerEvents: visible ? "auto" : "none",
                    }}
                    className="flex flex-col items-center gap-1 text-left"
                  >
                    <Avatar
                      className={`size-36 shadow-md ${isActive ? "border-2 border-[#04B1AF]" : ""}`}
                    >
                      <AvatarImage src={c.photo_url ?? undefined} alt="" />
                      <AvatarFallback className="text-3xl">{getInitials(c.name)}</AvatarFallback>
                    </Avatar>
                    {isActive && (
                      <div className="mt-4 flex flex-col items-center gap-1">
                        <span className="max-w-[220px] text-center text-lg font-semibold">{c.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {c.birth_date ? formatMonthDay(c.birth_date) : ""}
                        </span>
                        {today && (
                          <span className="animate-pulse rounded-full bg-[#04B1AF] px-2 py-0.5 text-xs font-medium text-white">
                            ¡Hoy!
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                }
              />
```

Everything above this block (the `contacts.map((c, i) => { ... })` setup computing `rel`, `ax`, `visible`, `isActive`, `scale`, `tx`, `ty`, `tz`, `ry`, `today`, `aboutToWrap`) is unchanged — only the returned JSX for each item changes from a `<Link>` to a `<BirthdayContactModal>`. The dot-navigation buttons below the carousel (the `n > 1 && (...)` block) are untouched.

Note: since every contact reaching this carousel is, by Task 6's wiring, someone whose birthday is NOT today (today's birthdays go to `TodayBirthdayCard` instead), the `today`/`aboutToWrap`-driven "¡Hoy!" badge branch above will never actually render in practice after this plan lands — but it's harmless dead code from a display standpoint (the condition is just never true), and removing it isn't necessary for this task; leave it as-is unless a later cleanup pass wants to simplify it.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/contacts/BirthdaysCoverflow.tsx"
git commit -m "feat: open a contact modal instead of navigating from the birthdays carousel"
```

---

## Task 6: Wire it all together in `BirthdaysWidget` and the home page

**Files:**
- Modify: `src/app/(app)/contacts/BirthdaysWidget.tsx`
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Update `BirthdaysWidget` to accept and render both groups**

Replace the full contents of `src/app/(app)/contacts/BirthdaysWidget.tsx`:

```tsx
import { Cake } from "lucide-react";
import type { BirthdayContact } from "@/lib/contacts";
import { BirthdaysCoverflow } from "./BirthdaysCoverflow";
import { TodayBirthdayCard } from "./TodayBirthdayCard";

export function BirthdaysWidget({
  todayContacts,
  upcomingContacts,
}: {
  todayContacts: BirthdayContact[];
  upcomingContacts: BirthdayContact[];
}) {
  if (todayContacts.length === 0 && upcomingContacts.length === 0) return null;

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 relative overflow-hidden rounded-2xl border border-[#04B1AF]/20 bg-gradient-to-br from-[#04B1AF]/10 via-white to-emerald-50 p-5 shadow-sm duration-700 dark:via-transparent">
      <div
        aria-hidden
        className="animate-blob absolute -top-10 -right-10 size-32 rounded-full bg-[#04B1AF]/10 blur-2xl"
      />
      <TodayBirthdayCard contacts={todayContacts} />
      {upcomingContacts.length > 0 && (
        <>
          <div className="relative mb-3 flex items-center gap-2 font-semibold">
            <span className="flex size-8 shrink-0 animate-bounce items-center justify-center rounded-full bg-gradient-to-br from-[#04B1AF] to-emerald-500 text-white">
              <Cake className="size-4" />
            </span>
            Próximos cumpleaños
          </div>
          <BirthdaysCoverflow contacts={upcomingContacts} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the home page to split contacts and pass both groups**

Replace the full contents of `src/app/(app)/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { getUpcomingBirthdays, splitTodayBirthdays, type BirthdayContact } from "@/lib/contacts";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });

  let todayBirthdays: BirthdayContact[] = [];
  let upcomingBirthdays: BirthdayContact[] = [];
  if (flagsRows?.[0]?.can_view) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, birth_date, photo_url, position, email, extension, fleet_phone, has_whatsapp, companies(name), departments(name)",
      )
      .eq("status", "active");

    const allBirthdayContacts: BirthdayContact[] = (contacts ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      birth_date: c.birth_date,
      photo_url: c.photo_url,
      position: c.position,
      email: c.email,
      extension: c.extension,
      fleet_phone: c.fleet_phone,
      has_whatsapp: c.has_whatsapp,
      company_name: (c.companies as unknown as { name: string } | null)?.name ?? null,
      department_name: (c.departments as unknown as { name: string } | null)?.name ?? null,
    }));

    const today = new Date();
    const split = splitTodayBirthdays(allBirthdayContacts, today);
    todayBirthdays = split.todayBirthdays;
    upcomingBirthdays = getUpcomingBirthdays(split.rest, today, 5);
  }

  return (
    <div className="mx-auto mt-12 max-w-md space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Bienvenido</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>
      <BirthdaysWidget todayContacts={todayBirthdays} upcomingContacts={upcomingBirthdays} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide — this closes out the type error Task 1 predicted would appear here.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/contacts/BirthdaysWidget.tsx" "src/app/(app)/page.tsx"
git commit -m "feat: split today's birthdays from upcoming ones on the home page"
```

---

## Task 7: Full regression pass and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the 4 new ones from Task 1. (If any pre-existing, unrelated integration test fails due to live-database seed drift or transient rate-limiting — a known characteristic of this project's shared Supabase test project, unrelated to this plan's changes — re-run that specific file in isolation to confirm it's not a real regression before treating the suite as green.)

- [ ] **Step 2: Manual smoke test**

With `npm run dev` running and at least one active contact whose `birth_date` is set to today's month/day:
- Confirm the green "Hoy cumple años" card appears above "Próximos cumpleaños" on the home page, with confetti falling continuously.
- If a second active contact also has today's birthday, confirm the card shows dot-navigation and rotates between them (autoplay + manual dot clicks).
- Click the photo/name inside the "Hoy cumple años" card — confirm a modal opens with name, position, empresa/departamento, cumpleaños, and (when present on that contact) correo, extensión, and teléfono/flota with a WhatsApp link — and confirm there is no "Editar" button anywhere in this modal.
- Click a photo in the "Próximos cumpleaños" carousel below — confirm it now opens the same kind of modal instead of navigating to `/contacts/[id]`.
- Confirm today's birthday contact does NOT also appear in the "Próximos cumpleaños" carousel.
- Temporarily set your OS/browser to prefer reduced motion and reload — confirm the confetti pieces stop animating (this reuses the existing `prefers-reduced-motion` handling already proven for `animate-blob`).

- [ ] **Step 3: Commit (only if any fixes were needed in this task)**

If regressions were found and fixed, commit them individually per fix with a descriptive message. If nothing needed fixing, skip this step.
