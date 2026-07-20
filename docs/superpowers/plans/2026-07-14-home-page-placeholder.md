# Home Page Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default `create-next-app` scaffold at `/` with a minimal authenticated landing page (welcome message + logout button), so the app no longer shows the Next.js starter content after login.

**Architecture:** `src/app/page.tsx` becomes a Server Component that reads the authenticated user via the existing `@/lib/supabase/server` client (a user is always present here, since `src/middleware.ts` already redirects unauthenticated requests to `/login`). A new Server Action in `src/app/actions.ts` signs the user out and redirects to `/login`, following the same pattern as `src/app/login/actions.ts`.

**Tech Stack:** Next.js (App Router, TypeScript), `@supabase/ssr` server client, existing shadcn/ui `Button` component, Tailwind CSS.

**Related spec discussion:** agreed inline during brainstorming (2026-07-14) — placeholder scope only, no navigation to not-yet-built admin sections.

---

### Task 1: Logout Server Action

**Files:**
- Create: `src/app/actions.ts`

- [ ] **Step 1: Write the action**

`src/app/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: add logout server action"
```

---

### Task 2: Replace the home page scaffold

**Files:**
- Modify: `src/app/page.tsx` (currently the `create-next-app` default content)

- [ ] **Step 1: Replace the page content**

`src/app/page.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Bienvenido</h1>
      <p className="text-sm text-muted-foreground">{user?.email}</p>
      <form action={logout}>
        <Button type="submit" variant="outline" className="w-full">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000/login`, log in, confirm you land on `/` showing "Bienvenido", your email, and a "Cerrar sesión" button. Click it and confirm you're redirected to `/login` and can no longer access `/` without logging in again.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace home page scaffold with authenticated placeholder"
```

---

### Task 3: Remove now-unused default assets (cleanup)

**Files:**
- Delete: `public/next.svg`, `public/vercel.svg` (only referenced by the old scaffold, no longer used anywhere)

- [ ] **Step 1: Confirm nothing else references them**

Run: `grep -rn "next.svg\|vercel.svg" src`
Expected: no output (no remaining references after Task 2).

- [ ] **Step 2: Delete the files**

```bash
git rm public/next.svg public/vercel.svg
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove unused scaffold assets"
```
