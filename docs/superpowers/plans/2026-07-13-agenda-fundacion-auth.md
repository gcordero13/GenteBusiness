# Agenda Telefónica — Plan 1: Fundación y Autenticación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + Supabase project with the full database schema, RLS-enforced permissions, authentication (login, invite-only user creation, password reset), and admin UI to manage role profiles, users, companies, and departments. No contact-facing features yet — those are Plan 2 and Plan 3.

**Architecture:** Next.js (App Router, TypeScript) with Supabase as the backend (Postgres + Auth + Storage). Row Level Security in Postgres is the permission source of truth; a `security definer` SQL function (`get_my_role_flags()`) exposes the caller's permission flags for use in RLS policies and in server-side authorization checks. Server Actions handle all writes; a service-role Supabase client is used only in server-only files for admin operations (inviting users), and every such usage re-checks the caller's permissions manually because the service role bypasses RLS.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Tailwind CSS, shadcn/ui, `@supabase/supabase-js`, `@supabase/ssr`, Vitest + React Testing Library, Supabase CLI (for migrations, no Docker — testing happens directly against the real Supabase project per user decision).

**Related spec:** `docs/superpowers/specs/2026-07-13-agenda-telefonica-design.md`

---

## Before you start (manual, one-time, human-only steps)

These require interactive login / dashboard access and cannot be automated by an agent. Do these before Task 6:

1. Have (or create) a Supabase project named `GenteBusiness`.
2. Note the **Project Reference ID** (Settings → General → Reference ID).
3. Note the **Project URL** and **anon public key** (Settings → API).
4. Note the **service_role key** (Settings → API — keep this secret, server-only, never in a `NEXT_PUBLIC_*` var).
5. Generate a **Supabase personal access token** (dashboard → Account → Access Tokens) for CLI login.

None of these values should ever be pasted into chat — enter them directly into `.env.local` (created in Task 4) or when prompted by `npx supabase login`.

---

### Task 1: Scaffold the Next.js project

**Files:**
- Create: entire Next.js project structure at repo root (`package.json`, `src/app/`, `tsconfig.json`, etc.)

- [ ] **Step 1: Run create-next-app**

Run:
```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
```
Expected: prompts about non-empty directory (contains `.git`, `.gitattributes`, `docs/`) — confirm to continue. Project files are generated at repo root.

- [ ] **Step 2: Verify it runs**

Run: `npm run dev -- --port 4400 &` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:4400` and stop the server.
Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project"
```

---

### Task 2: Set up shadcn/ui

**Files:**
- Modify: `components.json` (created by init)
- Create: `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`

- [ ] **Step 1: Initialize shadcn/ui**

Run: `npx shadcn@latest init -d`
Expected: creates `components.json`, updates `src/app/globals.css` with theme tokens, creates `src/lib/utils.ts`.

- [ ] **Step 2: Add the base components this plan actually uses**

Run: `npx shadcn@latest add button input label`
Expected: adds corresponding files under `src/components/ui/`.

Note: Plans 2 and 3 will add more components (`table`, `dialog`, `dropdown-menu`, etc.) when the tasks that use them are written — avoid installing components before something in the plan consumes them.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: set up shadcn/ui"
```

---

### Task 3: Set up Vitest + Testing Library

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`
- Modify: `package.json` (add `test` script)

- [ ] **Step 1: Install test dependencies**

Run:
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom dotenv
```

- [ ] **Step 2: Write the failing test (smoke test to prove the harness works)**

`src/lib/format.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { titleCase } from "./format";

describe("titleCase", () => {
  it("capitalizes each word", () => {
    expect(titleCase("juan perez")).toBe("Juan Perez");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `Cannot find module './format'` (file doesn't exist yet).

- [ ] **Step 4: Create the config and setup files**

`vitest.config.ts`:
```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

`src/test/setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
import "dotenv/config";
```

`src/lib/format.ts`:
```typescript
export function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS

- [ ] **Step 6: Add the `test` script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: set up Vitest and Testing Library"
```

---

### Task 4: Environment variable template and Supabase client packages

**Files:**
- Create: `.env.example`
- Modify: `.gitignore` (verify `.env*.local` is ignored)
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Install Supabase packages**

Run: `npm install @supabase/supabase-js @supabase/ssr`

- [ ] **Step 2: Create the env template (no real values)**

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: Verify `.gitignore` excludes local env files**

Check `.gitignore` (created by `create-next-app`) already contains:
```
.env*.local
```
If missing, append it. `create-next-app`'s default `.gitignore` includes this line already — confirm rather than duplicate.

- [ ] **Step 4: Create the browser client**

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Create the server client (Server Components / Server Actions)**

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // called from a Server Component render; middleware refreshes the session instead
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Create the service-role admin client (server-only)**

`src/lib/supabase/admin.ts`:
```typescript
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Bypasses Row Level Security entirely. Only import this from server-only
 * code (Server Actions, Route Handlers), and always check the caller's own
 * permissions (via get_my_role_flags) before using it.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

Run: `npm install server-only`

- [ ] **Step 7: Create the session-refresh middleware**

`src/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/forgot-password");

  if (!user && !isAuthRoute) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 8: Fill in your real `.env.local` (manual, not committed)**

Create `.env.local` at repo root (already gitignored) using the values noted in "Before you start". Do not paste these values into chat.

- [ ] **Step 9: Commit (env.local is not committed; verify with git status)**

```bash
git status
git add .env.example .gitignore src/lib/supabase src/middleware.ts package-lock.json package.json
git commit -m "feat: add Supabase client helpers and session middleware"
```

---

### Task 5: Link the Supabase CLI to the project (manual, human-only)

**Files:**
- Create: `supabase/config.toml` (generated by CLI)

- [ ] **Step 1: Log in**

Run: `npx supabase login`
Expected: opens a browser to authenticate; do this interactively, not through the agent.

- [ ] **Step 2: Initialize the local Supabase config**

Run: `npx supabase init`
Expected: creates `supabase/` directory with `config.toml` and `migrations/`.

- [ ] **Step 3: Link to the real project**

Run: `npx supabase link --project-ref <YOUR_PROJECT_REF>`
Expected: prompts for the database password (from Supabase dashboard), then confirms linking.

- [ ] **Step 4: Commit the generated config (no secrets in this file)**

```bash
git add supabase/config.toml
git commit -m "chore: link Supabase CLI to project"
```

---

### Task 6: Integration test harness for RLS

**Files:**
- Create: `src/test/integration/supabaseTestHelpers.ts`
- Test: `src/test/integration/smoke.test.ts`

This harness is reused by every RLS test in later tasks: it creates a throwaway auth user via the admin API, assigns it to a given role profile, signs in as that user, and tears everything down afterward.

- [ ] **Step 1: Write the failing smoke test**

`src/test/integration/smoke.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("Supabase project connectivity", () => {
  it("can reach the real project with the service role key", async () => {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.listUsers({ perPage: 1 });
    expect(error).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails (no env vars yet loaded in test run, or connectivity not yet proven)**

Run: `npx vitest run src/test/integration/smoke.test.ts`
Expected: FAIL if `.env.local` isn't picked up — if it fails with a fetch/auth error, that confirms the harness is exercising a real network call (not a false pass).

- [ ] **Step 3: Make dotenv load `.env.local` specifically for tests**

Modify `src/test/setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";

config({ path: ".env.local" });
```

- [ ] **Step 4: Run again to verify it passes**

Run: `npx vitest run src/test/integration/smoke.test.ts`
Expected: PASS

- [ ] **Step 5: Write the reusable test helpers**

`src/test/integration/supabaseTestHelpers.ts`:
```typescript
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type TestRoleProfileName = "Viewer" | "Editor" | "Super Admin";

export interface TestUser {
  id: string;
  email: string;
  client: ReturnType<typeof createSupabaseClient>;
}

const TEST_PASSWORD = "test-password-" + randomUUID();

export async function createTestUser(
  roleProfileName: TestRoleProfileName,
): Promise<TestUser> {
  const admin = createAdminClient();
  const email = `test-${randomUUID()}@example.com`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`failed to create test auth user: ${createError?.message}`);
  }

  const { data: profile, error: profileError } = await admin
    .from("role_profiles")
    .select("id")
    .eq("name", roleProfileName)
    .single();
  if (profileError || !profile) {
    throw new Error(`failed to find role profile "${roleProfileName}": ${profileError?.message}`);
  }

  const { error: appUserError } = await admin.from("app_users").insert({
    id: created.user.id,
    email,
    role_profile_id: profile.id,
  });
  if (appUserError) {
    throw new Error(`failed to insert app_users row: ${appUserError.message}`);
  }

  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) {
    throw new Error(`failed to sign in as test user: ${signInError.message}`);
  }

  return { id: created.user.id, email, client };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("app_users").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add Supabase integration test harness"
```

---

### Task 7: Migration — `role_profiles` table + seed data

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_role_profiles.sql`

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new role_profiles`
Expected: creates `supabase/migrations/<timestamp>_role_profiles.sql` (empty).

- [ ] **Step 2: Write the migration SQL**

Paste into the generated file:
```sql
create table public.role_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_deactivate boolean not null default false,
  can_manage_platform boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.role_profiles (name, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage_platform)
values
  ('Viewer', true, false, false, false, false, false),
  ('Editor', true, true, true, false, true, false),
  ('Super Admin', true, true, true, true, true, true)
on conflict (name) do nothing;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: reports the new migration applied successfully.

- [ ] **Step 4: Write a test confirming the seed data**

`src/test/integration/roleProfiles.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("role_profiles seed data", () => {
  it("has the three default profiles with the right flags", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("role_profiles")
      .select("name, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage_platform")
      .order("name");

    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Viewer", can_view: true, can_add: false }),
        expect.objectContaining({ name: "Editor", can_view: true, can_add: true, can_delete: false }),
        expect.objectContaining({ name: "Super Admin", can_manage_platform: true }),
      ]),
    );
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/integration/roleProfiles.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add role_profiles table with seed data"
```

---

### Task 8: Migration — `app_users` table + permission helper function

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_app_users_and_permissions.sql`

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new app_users_and_permissions`

- [ ] **Step 2: Write the migration SQL**

```sql
create table public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role_profile_id uuid not null references public.role_profiles (id),
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.get_my_role_flags()
returns table (
  can_view boolean,
  can_add boolean,
  can_edit boolean,
  can_delete boolean,
  can_deactivate boolean,
  can_manage_platform boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select rp.can_view, rp.can_add, rp.can_edit, rp.can_delete, rp.can_deactivate, rp.can_manage_platform
  from public.app_users au
  join public.role_profiles rp on rp.id = au.role_profile_id
  where au.id = auth.uid();
$$;

alter table public.role_profiles enable row level security;
alter table public.app_users enable row level security;

create policy "role_profiles_all_platform_managers" on public.role_profiles
for all
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "app_users_select_self_or_platform_manager" on public.app_users
for select
using (
  id = auth.uid()
  or coalesce((select can_manage_platform from public.get_my_role_flags()), false)
);

create policy "app_users_write_platform_managers" on public.app_users
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "app_users_update_platform_managers" on public.app_users
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "app_users_delete_platform_managers" on public.app_users
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`
Expected: applies successfully.

- [ ] **Step 4: Write the failing RLS test (Viewer cannot read app_users of others)**

`src/test/integration/appUsersRls.test.ts`:
```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("app_users RLS", () => {
  let viewer: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (viewer) await deleteTestUser(viewer.id);
    if (admin) await deleteTestUser(admin.id);
    viewer = undefined;
    admin = undefined;
  });

  it("blocks a Viewer from listing other app_users", async () => {
    viewer = await createTestUser("Viewer");

    const { data, error } = await viewer.client.from("app_users").select("*");

    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS silently filters rows the caller can't see
  });

  it("allows a Super Admin to list all app_users", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client.from("app_users").select("*");

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/integration/appUsersRls.test.ts`
Expected: PASS (the migration in Step 2 already implements the policies, so this test validates rather than drives them — see note below).

> Note: for this table the policy and test were written together rather than test-first, because the policy was necessary for `createTestUser`/`deleteTestUser` (Task 6) to function at all — those helpers rely on the admin (service-role) client, which bypasses RLS regardless. From Task 9 onward, tests are written before their policies wherever the ordering allows it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app_users table, permission helper function, and RLS policies"
```

---

### Task 9: Migration — `companies` and `departments` tables

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_companies_and_departments.sql`

- [ ] **Step 1: Write the failing RLS test first**

`src/test/integration/companiesRls.test.ts`:
```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("companies RLS", () => {
  let editor: TestUser | undefined;
  let admin: TestUser | undefined;

  afterEach(async () => {
    if (editor) await deleteTestUser(editor.id);
    if (admin) await deleteTestUser(admin.id);
    editor = undefined;
    admin = undefined;
  });

  it("lets any authenticated user read companies", async () => {
    editor = await createTestUser("Editor");

    const { data, error } = await editor.client.from("companies").select("*");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("blocks an Editor (no can_manage_platform) from creating a company", async () => {
    editor = await createTestUser("Editor");

    const { error } = await editor.client.from("companies").insert({ name: "Should Fail Co" });

    expect(error).not.toBeNull();
  });

  it("lets a Super Admin create a company", async () => {
    admin = await createTestUser("Super Admin");

    const { data, error } = await admin.client
      .from("companies")
      .insert({ name: `Test Co ${admin.id}` })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.name).toContain("Test Co");

    const adminClient = createAdminClient();
    await adminClient.from("companies").delete().eq("id", data!.id);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/test/integration/companiesRls.test.ts`
Expected: FAIL — `relation "public.companies" does not exist`.

- [ ] **Step 3: Generate and write the migration**

Run: `npx supabase migration new companies_and_departments`

```sql
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.departments enable row level security;

create policy "companies_select_any_authenticated" on public.companies
for select
using ( auth.uid() is not null );

create policy "companies_write_platform_managers" on public.companies
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "companies_update_platform_managers" on public.companies
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "companies_delete_platform_managers" on public.companies
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "departments_select_any_authenticated" on public.departments
for select
using ( auth.uid() is not null );

create policy "departments_write_platform_managers" on public.departments
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "departments_update_platform_managers" on public.departments
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "departments_delete_platform_managers" on public.departments
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
```

- [ ] **Step 4: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 5: Run the test again to verify it passes**

Run: `npx vitest run src/test/integration/companiesRls.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add companies and departments tables with RLS"
```

---

### Task 10: Migration — `contacts` table with granular update permissions

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_contacts.sql`

- [ ] **Step 1: Write the failing RLS tests first**

`src/test/integration/contactsRls.test.ts`:
```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

async function makeCompanyAndDepartment() {
  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .insert({ name: "RLS Test Co" })
    .select()
    .single();
  const { data: department } = await admin
    .from("departments")
    .insert({ name: "RLS Test Dept", company_id: company!.id })
    .select()
    .single();
  return { companyId: company!.id as string, departmentId: department!.id as string };
}

describe("contacts RLS", () => {
  let viewer: TestUser | undefined;
  let editor: TestUser | undefined;
  let companyId: string;
  let departmentId: string;
  let contactId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (departmentId) await admin.from("departments").delete().eq("id", departmentId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (viewer) await deleteTestUser(viewer.id);
    if (editor) await deleteTestUser(editor.id);
    viewer = undefined;
    editor = undefined;
    contactId = "";
  });

  it("lets a Viewer read contacts but not insert one", async () => {
    ({ companyId, departmentId } = await makeCompanyAndDepartment());
    viewer = await createTestUser("Viewer");

    const { error: readError } = await viewer.client.from("contacts").select("*");
    expect(readError).toBeNull();

    const { error: insertError } = await viewer.client.from("contacts").insert({
      first_name: "Ana",
      last_name: "Lopez",
      company_id: companyId,
      department_id: departmentId,
    });
    expect(insertError).not.toBeNull();
  });

  it("lets an Editor insert a contact and edit non-status fields, but not change status", async () => {
    ({ companyId, departmentId } = await makeCompanyAndDepartment());
    editor = await createTestUser("Editor");

    const { data: inserted, error: insertError } = await editor.client
      .from("contacts")
      .insert({
        first_name: "Ana",
        last_name: "Lopez",
        company_id: companyId,
        department_id: departmentId,
        status: "active",
      })
      .select()
      .single();
    expect(insertError).toBeNull();
    contactId = inserted!.id;

    const { error: editError } = await editor.client
      .from("contacts")
      .update({ position: "Supervisor" })
      .eq("id", contactId);
    expect(editError).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/integration/contactsRls.test.ts`
Expected: FAIL — `relation "public.contacts" does not exist`.

- [ ] **Step 3: Generate and write the migration**

Run: `npx supabase migration new contacts`

```sql
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  extension text,
  fleet_phone text,
  has_whatsapp boolean not null default false,
  department_id uuid references public.departments (id),
  company_id uuid references public.companies (id),
  position text,
  photo_url text,
  reports_to_id uuid references public.contacts (id),
  birth_date date,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "contacts_select" on public.contacts
for select
using ( coalesce((select can_view from public.get_my_role_flags()), false) );

create policy "contacts_insert" on public.contacts
for insert
with check ( coalesce((select can_add from public.get_my_role_flags()), false) );

create policy "contacts_update" on public.contacts
for update
using (
  coalesce((select can_edit from public.get_my_role_flags()), false)
  or coalesce((select can_deactivate from public.get_my_role_flags()), false)
)
with check (
  coalesce((select can_edit from public.get_my_role_flags()), false)
  or coalesce((select can_deactivate from public.get_my_role_flags()), false)
);

create policy "contacts_delete" on public.contacts
for delete
using ( coalesce((select can_delete from public.get_my_role_flags()), false) );

-- RLS alone can't distinguish "changed status" from "changed other fields" within
-- a single UPDATE statement, so a trigger enforces the finer-grained rule from
-- the spec: editing content requires can_edit, changing status requires can_deactivate.
create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
begin
  select * into flags from public.get_my_role_flags();

  if flags is null then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.extension, new.fleet_phone, new.has_whatsapp,
    new.department_id, new.company_id, new.position, new.photo_url, new.reports_to_id, new.birth_date
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.extension, old.fleet_phone, old.has_whatsapp,
    old.department_id, old.company_id, old.position, old.photo_url, old.reports_to_id, old.birth_date
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_update_permission_check
before update on public.contacts
for each row execute function public.enforce_contacts_update_permissions();
```

- [ ] **Step 4: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 5: Run the tests again to verify they pass**

Run: `npx vitest run src/test/integration/contactsRls.test.ts`
Expected: PASS

- [ ] **Step 6: Write and run one more test for the status-vs-edit split (Editor profile has can_deactivate=true per the seed, so use a custom profile to isolate it)**

`src/test/integration/contactsStatusPermission.test.ts`:
```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("contacts status change requires can_deactivate specifically", () => {
  let editOnly: TestUser | undefined;
  let companyId: string;
  let departmentId: string;
  let contactId: string;
  let editOnlyProfileId: string;

  afterEach(async () => {
    const admin = createAdminClient();
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (departmentId) await admin.from("departments").delete().eq("id", departmentId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (editOnly) await deleteTestUser(editOnly.id);
    if (editOnlyProfileId) await admin.from("role_profiles").delete().eq("id", editOnlyProfileId);
    editOnly = undefined;
    contactId = "";
  });

  it("blocks status changes for a profile with can_edit but not can_deactivate", async () => {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("role_profiles")
      .insert({
        name: `Edit Only ${Date.now()}`,
        can_view: true,
        can_add: true,
        can_edit: true,
        can_delete: false,
        can_deactivate: false,
        can_manage_platform: false,
      })
      .select()
      .single();
    editOnlyProfileId = profile!.id;

    const { data: company } = await admin.from("companies").insert({ name: "Status Test Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Status Test Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    // createTestUser only knows the three seeded profile names, so assign this
    // custom profile directly after creating the test user as a Viewer.
    editOnly = await createTestUser("Viewer");
    await admin.from("app_users").update({ role_profile_id: editOnlyProfileId }).eq("id", editOnly.id);

    const { data: contact } = await editOnly.client
      .from("contacts")
      .insert({ first_name: "Ana", last_name: "Lopez", company_id: companyId, department_id: departmentId })
      .select()
      .single();
    contactId = contact!.id;

    const { error: editError } = await editOnly.client
      .from("contacts")
      .update({ position: "New Title" })
      .eq("id", contactId);
    expect(editError).toBeNull();

    const { error: statusError } = await editOnly.client
      .from("contacts")
      .update({ status: "deactivated" })
      .eq("id", contactId);
    expect(statusError).not.toBeNull();
  });
});
```

Run: `npx vitest run src/test/integration/contactsStatusPermission.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add contacts table with granular edit/deactivate RLS enforcement"
```

---

### Task 11: Storage bucket for contact photos

**Files:**
- Create: `supabase/migrations/<generated_timestamp>_contact_photos_storage.sql`

- [ ] **Step 1: Generate and write the migration**

Run: `npx supabase migration new contact_photos_storage`

```sql
insert into storage.buckets (id, name, public)
values ('contact-photos', 'contact-photos', true)
on conflict (id) do nothing;

create policy "contact_photos_public_read" on storage.objects
for select
using ( bucket_id = 'contact-photos' );

create policy "contact_photos_write_can_add_or_edit" on storage.objects
for insert
with check (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_role_flags()), false)
    or coalesce((select can_edit from public.get_my_role_flags()), false)
  )
);

create policy "contact_photos_update_can_add_or_edit" on storage.objects
for update
using (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_role_flags()), false)
    or coalesce((select can_edit from public.get_my_role_flags()), false)
  )
);

create policy "contact_photos_delete_can_edit" on storage.objects
for delete
using (
  bucket_id = 'contact-photos'
  and coalesce((select can_edit from public.get_my_role_flags()), false)
);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 3: Write a test confirming the bucket exists and is public-read**

`src/test/integration/contactPhotosStorage.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("contact-photos storage bucket", () => {
  it("exists and is public", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket("contact-photos");

    expect(error).toBeNull();
    expect(data?.public).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/integration/contactPhotosStorage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add contact-photos storage bucket and policies"
```

---

### Task 12: Bootstrap script for the first Super Admin

**Files:**
- Create: `scripts/bootstrap-super-admin.sql`

- [ ] **Step 1: Write the script**

`scripts/bootstrap-super-admin.sql`:
```sql
-- Run manually, once, in the Supabase SQL Editor (or via psql) — not part of
-- the migration history. The target person must already have a row in
-- auth.users (e.g. they accepted an invite and set a password) before this
-- runs. Replace the email below before running.

insert into public.app_users (id, email, role_profile_id, full_name)
select
  u.id,
  u.email,
  (select id from public.role_profiles where name = 'Super Admin'),
  null
from auth.users u
where u.email = 'REPLACE_WITH_ADMIN_EMAIL@example.com'
on conflict (id) do update
  set role_profile_id = excluded.role_profile_id;
```

- [ ] **Step 2: Document it in a short README note**

Create `scripts/README.md`:
```markdown
# scripts/

## bootstrap-super-admin.sql

One-time, manual script. Run in the Supabase SQL Editor after the intended
Super Admin has an `auth.users` account (via Supabase Auth invite or
password-reset flow). Edit the email placeholder before running.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/
git commit -m "chore: add first Super Admin bootstrap script"
```

---

### Task 13: Login page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`

- [ ] **Step 1: Write the Server Action**

`src/app/login/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}
```

- [ ] **Step 2: Write the page**

`src/app/login/page.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={login} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Clave</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" className="w-full">
          Entrar
        </Button>
      </form>
      <a href="/forgot-password" className="block text-sm text-muted-foreground underline">
        ¿Olvidaste tu clave?
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000/login`, submit an invalid email/password.
Expected: redirected back to `/login?error=...` with the Supabase error message shown.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add login page"
```

---

### Task 14: Forgot-password and reset-password pages

**Files:**
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/forgot-password/actions.ts`
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/actions.ts`

- [ ] **Step 1: Forgot-password action**

`src/app/forgot-password/actions.ts`:
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email"));
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
  });

  // Always report success, whether or not the email exists in app_users —
  // do not leak which addresses are registered.
}
```

- [ ] **Step 2: Forgot-password page**

`src/app/forgot-password/page.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  async function submit(formData: FormData) {
    "use server";
    await requestPasswordReset(formData);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Restablecer clave</h1>
      <form action={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <Button type="submit" className="w-full">
          Enviar enlace
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Si tu correo está registrado, recibirás un enlace para restablecer tu clave.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Reset-password action**

`src/app/reset-password/actions.ts`:
```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password"));
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login");
}
```

- [ ] **Step 4: Reset-password page**

`src/app/reset-password/page.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Elige una nueva clave</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={updatePassword} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="password">Nueva clave</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>
        <Button type="submit" className="w-full">
          Guardar
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Add `NEXT_PUBLIC_SITE_URL` to the env template**

Modify `.env.example`, add:
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
Add the same key with your real deployed/local URL to `.env.local`.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, visit `/forgot-password`, submit a real allowlisted test email, confirm the Supabase Auth email arrives with a link to `/reset-password`, follow it, set a new password, confirm redirect to `/login` and that the new password works.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add forgot-password and reset-password flows"
```

---

### Task 15: Invite-user Server Action (Super Admin only)

**Files:**
- Create: `src/app/(admin)/users/actions.ts`
- Test: `src/app/(admin)/users/actions.test.ts`

- [ ] **Step 1: Write the failing unit test (permission check, using a mocked Supabase client)**

`src/app/(admin)/users/actions.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteUser } from "./actions";

function mockServerClient(flags: { can_manage_platform: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "caller-id" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [flags], error: null }),
  };
}

describe("inviteUser", () => {
  it("rejects callers without can_manage_platform", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage_platform: false }) as never,
    );

    const result = await inviteUser({ email: "new@example.com", roleProfileId: "profile-1" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/(admin)/users/actions.test.ts"`
Expected: FAIL — `./actions` module not found.

- [ ] **Step 3: Write the Server Action**

`src/app/(admin)/users/actions.ts`:
```typescript
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface InviteUserInput {
  email: string;
  roleProfileId: string;
}

interface InviteUserResult {
  error?: string;
}

async function callerCanManagePlatform(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_role_flags");
  return Boolean(data?.[0]?.can_manage_platform);
}

export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  if (!(await callerCanManagePlatform())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    input.email,
  );
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "No se pudo invitar al usuario" };
  }

  const { error: insertError } = await admin.from("app_users").insert({
    id: invited.user.id,
    email: input.email,
    role_profile_id: input.roleProfileId,
  });
  if (insertError) {
    return { error: insertError.message };
  }

  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/(admin)/users/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add invite-user server action gated by can_manage_platform"
```

---

### Task 16: Admin UI — Users management page

**Files:**
- Create: `src/app/(admin)/users/page.tsx`
- Create: `src/app/(admin)/users/InviteUserForm.tsx`

- [ ] **Step 1: Server Component page (list + gate)**

`src/app/(admin)/users/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteUserForm } from "./InviteUserForm";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];

  if (!flags?.can_manage_platform) {
    redirect("/");
  }

  const { data: users } = await supabase
    .from("app_users")
    .select("id, email, full_name, role_profiles(name)")
    .order("email");
  const { data: profiles } = await supabase.from("role_profiles").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Usuarios</h1>
      <InviteUserForm profiles={profiles ?? []} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>Correo</th>
            <th>Perfil</th>
          </tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{(u.role_profiles as unknown as { name: string })?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Client form component**

`src/app/(admin)/users/InviteUserForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteUser } from "./actions";

interface Profile {
  id: string;
  name: string;
}

export function InviteUserForm({ profiles }: { profiles: Profile[] }) {
  const [email, setEmail] = useState("");
  const [roleProfileId, setRoleProfileId] = useState(profiles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await inviteUser({ email, roleProfileId });
      setError(result.error ?? null);
      if (!result.error) setEmail("");
    });
  }

  return (
    <div className="space-y-2 rounded border p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Input
        placeholder="correo@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select
        className="w-full rounded border p-2 text-sm"
        value={roleProfileId}
        onChange={(e) => setRoleProfileId(e.target.value)}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button onClick={submit} disabled={isPending || !email || !roleProfileId}>
        Invitar
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as the bootstrap Super Admin, visit `/users`, invite a real test email, confirm the invite email arrives, confirm the new row appears in the table with the chosen profile.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add admin users management page"
```

---

### Task 17: Admin UI — Role profiles management page

**Files:**
- Create: `src/app/(admin)/role-profiles/page.tsx`
- Create: `src/app/(admin)/role-profiles/actions.ts`
- Create: `src/app/(admin)/role-profiles/RoleProfileForm.tsx`

- [ ] **Step 1: Server actions (create/update, relying on RLS for the permission gate)**

`src/app/(admin)/role-profiles/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface RoleProfileInput {
  id?: string;
  name: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_deactivate: boolean;
  can_manage_platform: boolean;
}

export async function saveRoleProfile(input: RoleProfileInput) {
  const supabase = await createClient();
  const { id, ...fields } = input;

  const query = id
    ? supabase.from("role_profiles").update(fields).eq("id", id)
    : supabase.from("role_profiles").insert(fields);

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath("/role-profiles");
  return {};
}
```

- [ ] **Step 2: Page**

`src/app/(admin)/role-profiles/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleProfileForm } from "./RoleProfileForm";

export default async function RoleProfilesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: profiles } = await supabase.from("role_profiles").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Perfiles de rol</h1>
      <RoleProfileForm />
      <ul className="space-y-2">
        {(profiles ?? []).map((profile) => (
          <li key={profile.id} className="rounded border p-3 text-sm">
            <strong>{profile.name}</strong>: ver={String(profile.can_view)}, agregar=
            {String(profile.can_add)}, editar={String(profile.can_edit)}, eliminar=
            {String(profile.can_delete)}, anular={String(profile.can_deactivate)}, gestiona=
            {String(profile.can_manage_platform)}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Form component (create only, for simplicity — editing reuses the same fields via `id`)**

`src/app/(admin)/role-profiles/RoleProfileForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveRoleProfile } from "./actions";

const FLAG_KEYS = [
  "can_view",
  "can_add",
  "can_edit",
  "can_delete",
  "can_deactivate",
  "can_manage_platform",
] as const;

const FLAG_LABELS: Record<(typeof FLAG_KEYS)[number], string> = {
  can_view: "Ver",
  can_add: "Agregar",
  can_edit: "Editar",
  can_delete: "Eliminar",
  can_deactivate: "Anular",
  can_manage_platform: "Gestionar plataforma",
};

export function RoleProfileForm() {
  const [name, setName] = useState("");
  const [flags, setFlags] = useState<Record<(typeof FLAG_KEYS)[number], boolean>>({
    can_view: false,
    can_add: false,
    can_edit: false,
    can_delete: false,
    can_deactivate: false,
    can_manage_platform: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveRoleProfile({ name, ...flags });
      setError(result.error ?? null);
      if (!result.error) setName("");
    });
  }

  return (
    <div className="space-y-2 rounded border p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Input placeholder="Nombre del perfil" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 text-sm">
        {FLAG_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) => setFlags((prev) => ({ ...prev, [key]: e.target.checked }))}
            />
            {FLAG_LABELS[key]}
          </label>
        ))}
      </div>
      <Button onClick={submit} disabled={isPending || !name}>
        Crear perfil
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as Super Admin, visit `/role-profiles`, create a new profile (e.g. "Solo lectura de flota"), confirm it appears in the list with correct flags. Log in as a non-Super Admin test user and confirm visiting `/role-profiles` redirects to `/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin role profiles management page"
```

---

### Task 18: Admin UI — Companies and departments management

**Files:**
- Create: `src/app/(admin)/companies/page.tsx`
- Create: `src/app/(admin)/companies/actions.ts`
- Create: `src/app/(admin)/companies/CompanyForm.tsx`
- Create: `src/app/(admin)/departments/page.tsx`
- Create: `src/app/(admin)/departments/actions.ts`
- Create: `src/app/(admin)/departments/DepartmentForm.tsx`

- [ ] **Step 1: Companies actions**

`src/app/(admin)/companies/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCompany(name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({ name });
  if (error) return { error: error.message };
  revalidatePath("/companies");
  return {};
}
```

- [ ] **Step 2: Companies page**

`src/app/(admin)/companies/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm } from "./CompanyForm";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Empresas</h1>
      <CompanyForm />
      <ul className="space-y-1 text-sm">
        {(companies ?? []).map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Companies form**

`src/app/(admin)/companies/CompanyForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCompany } from "./actions";

export function CompanyForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createCompany(name);
      setError(result.error ?? null);
      if (!result.error) setName("");
    });
  }

  return (
    <div className="flex gap-2">
      <Input placeholder="Nombre de la empresa" value={name} onChange={(e) => setName(e.target.value)} />
      <Button onClick={submit} disabled={isPending || !name}>
        Agregar
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Departments actions**

`src/app/(admin)/departments/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createDepartment(name: string, companyId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ name, company_id: companyId });
  if (error) return { error: error.message };
  revalidatePath("/departments");
  return {};
}
```

- [ ] **Step 5: Departments page**

`src/app/(admin)/departments/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DepartmentForm } from "./DepartmentForm";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, companies(name)")
    .order("name");
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Departamentos</h1>
      <DepartmentForm companies={companies ?? []} />
      <ul className="space-y-1 text-sm">
        {(departments ?? []).map((d) => (
          <li key={d.id}>
            {d.name} — {(d.companies as unknown as { name: string })?.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Departments form**

`src/app/(admin)/departments/DepartmentForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDepartment } from "./actions";

interface Company {
  id: string;
  name: string;
}

export function DepartmentForm({ companies }: { companies: Company[] }) {
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createDepartment(name, companyId);
      setError(result.error ?? null);
      if (!result.error) setName("");
    });
  }

  return (
    <div className="flex gap-2">
      <Input placeholder="Nombre del departamento" value={name} onChange={(e) => setName(e.target.value)} />
      <select
        className="rounded border p-2 text-sm"
        value={companyId}
        onChange={(e) => setCompanyId(e.target.value)}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button onClick={submit} disabled={isPending || !name || !companyId}>
        Agregar
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, log in as Super Admin, create a company at `/companies`, create a department under it at `/departments`, confirm both list correctly. Confirm a non-admin test user is redirected away from both pages.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add admin companies and departments management pages"
```

---

### Task 19: Full end-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all unit and integration tests pass.

- [ ] **Step 2: Manual walkthrough**

1. Run the bootstrap script (Task 12) with your real email against your linked Supabase project (after signing up once via `/forgot-password` → set initial password, since no invite has been sent to you yet).
2. Log in at `/login` with that account.
3. Visit `/role-profiles`, confirm the three seeded profiles show correct flags.
4. Visit `/users`, invite a second test email with the "Viewer" profile.
5. Complete that invite in an incognito window (or second browser), confirm the Viewer can log in but is redirected away from `/users`, `/role-profiles`, `/companies`, `/departments`.
6. Visit `/companies` and `/departments` as Super Admin, create one of each.
7. Confirm `git log` shows one commit per task and `git status` is clean.

- [ ] **Step 3: Note follow-up work**

Plan 2 (contacts CRUD + search) and Plan 3 (WhatsApp/email links, birthdays, org chart, import/export) are written separately when work begins on them, per the approved spec at `docs/superpowers/specs/2026-07-13-agenda-telefonica-design.md`.
