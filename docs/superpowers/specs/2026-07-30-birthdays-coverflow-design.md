# Birthdays Coverflow — Design Spec

**Goal:** Replace the plain text list in the home page's "Próximos cumpleaños" widget with a small 3D coverflow carousel showing each of the next 5 birthday contacts' photo (or initials) with their name below, auto-advancing every 5 minutes, clickable through to the contact's profile.

**Why:** The current widget (`BirthdaysWidget.tsx`) lists upcoming birthdays as plain text rows (name + date). The user wants a more visual presentation reusing the "coverflow" 3D effect from a pasted Originkit/Framer reference component (`Smooth3DSlideshow`), scoped down to exactly what this one usage needs.

## Architecture

- `src/lib/contacts.ts`: add `photo_url: string | null` to the `BirthdayContact` interface. `getUpcomingBirthdays<T extends BirthdayContact>` is generic and needs no change.
- `src/app/(app)/page.tsx`: the contacts `select` query adds `photo_url`; the mapping into `BirthdayContact` objects passes it through.
- `src/app/(app)/contacts/BirthdaysWidget.tsx` (server component): keeps its existing header, cake icon, and gradient/blob decoration. Replaces the `<ul>` of text rows with `<BirthdaysCoverflow contacts={contacts} />`.
- **New file** `src/app/(app)/contacts/BirthdaysCoverflow.tsx` (`"use client"`): the carousel itself.

## The carousel

Reuses the 3D coverflow positioning math from the pasted `Smooth3DSlideshow` reference (per-slide `translateX`/`translateZ`/`rotateY`/`scale` derived from distance-from-center), but as fixed internal constants rather than configurable props — this component has exactly one call site, so there is no reason to expose a generic prop API (no `radius`, `tilt`, `sideTilt`, `gap`, `opacity`, `transition`, `titleFont`, `titlePosition`, etc.).

Sizing is tuned for the home page's narrow `max-w-md` column: active card ~96px, up to 2 neighbors visible on each side, scaled down and pushed back per the existing `SCALE_STEP`/`DEPTH` pattern.

Each card renders:
- `Avatar` / `AvatarImage` / `AvatarFallback` (same pattern as `ContactsCards.tsx`) — initials fallback when `photo_url` is empty.
- Contact name below the image.
- Formatted birth date below the name (`formatMonthDay`, reused from `@/lib/contacts`).
- "¡Hoy!" badge when the birthday is today (reusing `isTodayBirthday` logic already in `BirthdaysWidget.tsx`).

Behavior:
- Autoplay only, fixed 5-minute interval (300000ms) — no manual arrow-key navigation (not useful in a passive home widget).
- Clicking any card (active or not) navigates directly to `/contacts/[id]` via `next/link` — no "bring to center first" intermediate click, since this widget isn't the primary navigation surface for browsing contacts.

## Edge cases

- Zero upcoming birthdays: `BirthdaysWidget` already returns `null` in this case; unchanged.
- Fewer than 5 contacts (1-4): carousel loop math already handles `n < 5` (loop-around uses the real list length).
- No `photo_url`: initials via `AvatarFallback`.

## Testing

No new integration tests (no RLS/DB surface touched). `src/lib/contacts.test.ts` may need a one-field addition if any existing test constructs a `BirthdayContact` literal that would now be missing `photo_url` under stricter typing — verify during implementation. Otherwise, verification is `npx tsc --noEmit` plus a manual visual check with the dev server.
