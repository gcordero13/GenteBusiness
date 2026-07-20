# Permisos por Módulo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the platform's single flat permission set per role profile with independent permissions per module (Agenda, Usuarios, Perfiles de rol, Empresas, Departamentos, Actividades), migrating the 3 existing role profiles automatically, rewriting every RLS policy in the database to check the correct module, and rebuilding the Role Profiles screen as a create/edit permission matrix.

**Architecture:** Two new tables (`modules`, `role_profile_permissions`) replace the flat boolean columns on `role_profiles`. Two new `security definer` SQL functions (`get_my_module_permissions(module_key)` for single-module checks, `get_my_permissions()` for all-modules-at-once, used by the sidebar) replace `get_my_role_flags()`. Every existing RLS policy that referenced `get_my_role_flags()` is rewritten to call `get_my_module_permissions('<module>')` instead, mapping each existing table to its module (`contacts`→contacts, `app_users`→users, `companies`→companies, `departments`→departments, `company_events`→activities, `role_profiles`/`role_profile_permissions`→role_profiles). Application code follows the same one-flag-set-per-module pattern already used everywhere in this codebase — this is a mechanical rename/re-parameterization of an existing pattern, not a new one. The migration must be applied manually via the Supabase dashboard SQL Editor (the CLI is still not linked on this machine — same situation as every prior migration in this project).

**Tech Stack:** Next.js (App Router), Supabase (Postgres, RLS, `security definer` functions), Vitest (integration tests hitting the live Supabase project).

**Related spec:** `docs/superpowers/specs/2026-07-15-per-module-permissions-design.md`.

**⚠️ This plan touches the authorization logic for every table in the database. Each task's review must independently re-verify RLS behavior against the live database, not just check that code compiles.**

---

### Task 1: New tables, data migration, new functions, and every RLS policy rewrite (one combined migration)

**Files:**
- Modify: `src/test/integration/roleProfiles.test.ts` (rewritten to check the new structure)
- Modify: `src/test/integration/contactsStatusPermission.test.ts` (creates a custom role profile — must use the new structure)
- Create: `supabase/migrations/<generated_timestamp>_per_module_permissions.sql`

- [ ] **Step 1: Rewrite `roleProfiles.test.ts` to check the new structure (this will fail until the migration is applied — that's expected RED)**

`src/test/integration/roleProfiles.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

describe("role_profile_permissions seed data", () => {
  it("has the three default profiles with the right per-module flags, migrated from the old flat model", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("role_profile_permissions")
      .select("can_view, can_add, can_delete, can_manage, role_profiles(name), modules(key)")
      .order("role_profiles(name)");

    expect(error).toBeNull();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          can_view: true,
          can_add: false,
          role_profiles: expect.objectContaining({ name: "Viewer" }),
        }),
        expect.objectContaining({
          can_view: true,
          can_add: true,
          can_delete: false,
          role_profiles: expect.objectContaining({ name: "Editor" }),
        }),
        expect.objectContaining({
          can_manage: true,
          role_profiles: expect.objectContaining({ name: "Super Admin" }),
        }),
      ]),
    );
    // Every profile should have exactly 6 rows (one per module) after migration.
    const byProfile = new Map<string, number>();
    for (const row of data ?? []) {
      const name = (row.role_profiles as unknown as { name: string }).name;
      byProfile.set(name, (byProfile.get(name) ?? 0) + 1);
    }
    expect(byProfile.get("Viewer")).toBe(6);
    expect(byProfile.get("Editor")).toBe(6);
    expect(byProfile.get("Super Admin")).toBe(6);
  });

  it("has the 6 expected modules", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.from("modules").select("key").order("key");

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.key).sort()).toEqual(
      ["activities", "companies", "contacts", "departments", "role_profiles", "users"].sort(),
    );
  });
});
```

- [ ] **Step 2: Rewrite `contactsStatusPermission.test.ts` to grant the custom profile's permissions via `role_profile_permissions` instead of flat columns on `role_profiles`**

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
      .insert({ name: `Edit Only ${Date.now()}` })
      .select()
      .single();
    editOnlyProfileId = profile!.id;

    const { data: contactsModule } = await admin
      .from("modules")
      .select("id")
      .eq("key", "contacts")
      .single();

    await admin.from("role_profile_permissions").insert({
      role_profile_id: editOnlyProfileId,
      module_id: contactsModule!.id,
      can_view: true,
      can_add: true,
      can_edit: true,
      can_delete: false,
      can_deactivate: false,
      can_manage: false,
      can_authorize: false,
    });

    const { data: company } = await admin.from("companies").insert({ name: "Status Test Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Status Test Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

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
(The `role_profile_permissions` row is cleaned up automatically via `on delete cascade` when the `role_profiles` row is deleted in `afterEach` — no extra cleanup needed.)

- [ ] **Step 3: Run both rewritten tests to confirm they fail against the current (pre-migration) schema**

Run: `npx vitest run src/test/integration/roleProfiles.test.ts src/test/integration/contactsStatusPermission.test.ts`
Expected: FAIL — `role_profile_permissions`/`modules` don't exist yet (PGRST205), or the plain `role_profiles` insert without flat columns behaves differently than expected pre-migration. Either way, this must fail before the migration is applied.

- [ ] **Step 4: Generate the migration**

Run: `npx supabase migration new per_module_permissions`

```sql
begin;

-- 1. New tables

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.modules (key, label) values
  ('contacts', 'Agenda'),
  ('users', 'Usuarios'),
  ('role_profiles', 'Perfiles de rol'),
  ('companies', 'Empresas'),
  ('departments', 'Departamentos'),
  ('activities', 'Actividades');

create table public.role_profile_permissions (
  id uuid primary key default gen_random_uuid(),
  role_profile_id uuid not null references public.role_profiles (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_deactivate boolean not null default false,
  can_manage boolean not null default false,
  can_authorize boolean not null default false,
  unique (role_profile_id, module_id)
);

-- 2. Migrate existing flat permissions into the new per-module structure
insert into public.role_profile_permissions
  (role_profile_id, module_id, can_view, can_add, can_edit, can_delete, can_deactivate, can_manage, can_authorize)
select rp.id, m.id, rp.can_view, rp.can_add, rp.can_edit, rp.can_delete, rp.can_deactivate, rp.can_manage_platform, false
from public.role_profiles rp
cross join public.modules m;

-- 3. New permission-check functions
create or replace function public.get_my_module_permissions(p_module_key text)
returns table (
  can_view boolean,
  can_add boolean,
  can_edit boolean,
  can_delete boolean,
  can_deactivate boolean,
  can_manage boolean,
  can_authorize boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select rpp.can_view, rpp.can_add, rpp.can_edit, rpp.can_delete, rpp.can_deactivate, rpp.can_manage, rpp.can_authorize
  from public.app_users au
  join public.role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
  join public.modules m on m.id = rpp.module_id
  where au.id = auth.uid() and m.key = p_module_key;
$$;

create or replace function public.get_my_permissions()
returns table (
  module_key text,
  can_view boolean,
  can_add boolean,
  can_edit boolean,
  can_delete boolean,
  can_deactivate boolean,
  can_manage boolean,
  can_authorize boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select m.key, rpp.can_view, rpp.can_add, rpp.can_edit, rpp.can_delete, rpp.can_deactivate, rpp.can_manage, rpp.can_authorize
  from public.app_users au
  join public.role_profile_permissions rpp on rpp.role_profile_id = au.role_profile_id
  join public.modules m on m.id = rpp.module_id
  where au.id = auth.uid();
$$;

-- 4. RLS for the two new tables
alter table public.modules enable row level security;
create policy "modules_select_any_authenticated" on public.modules
for select using ( auth.uid() is not null );

alter table public.role_profile_permissions enable row level security;
create policy "role_profile_permissions_select_platform_managers" on public.role_profile_permissions
for select
using ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) );
create policy "role_profile_permissions_write_platform_managers" on public.role_profile_permissions
for all
using ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) );

-- 5. Re-point every existing policy at the module-specific checks

drop policy "role_profiles_all_platform_managers" on public.role_profiles;
create policy "role_profiles_all_platform_managers" on public.role_profiles
for all
using ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('role_profiles')), false) );

drop policy "app_users_select_self_or_platform_manager" on public.app_users;
create policy "app_users_select_self_or_platform_manager" on public.app_users
for select
using ( id = auth.uid() or coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "app_users_write_platform_managers" on public.app_users;
create policy "app_users_write_platform_managers" on public.app_users
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "app_users_update_platform_managers" on public.app_users;
create policy "app_users_update_platform_managers" on public.app_users
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "app_users_delete_platform_managers" on public.app_users;
create policy "app_users_delete_platform_managers" on public.app_users
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('users')), false) );

drop policy "companies_write_platform_managers" on public.companies;
create policy "companies_write_platform_managers" on public.companies
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) );

drop policy "companies_update_platform_managers" on public.companies;
create policy "companies_update_platform_managers" on public.companies
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) );

drop policy "companies_delete_platform_managers" on public.companies;
create policy "companies_delete_platform_managers" on public.companies
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('companies')), false) );

drop policy "departments_write_platform_managers" on public.departments;
create policy "departments_write_platform_managers" on public.departments
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) );

drop policy "departments_update_platform_managers" on public.departments;
create policy "departments_update_platform_managers" on public.departments
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) );

drop policy "departments_delete_platform_managers" on public.departments;
create policy "departments_delete_platform_managers" on public.departments
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('departments')), false) );

drop policy "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
for select
using ( coalesce((select can_view from public.get_my_module_permissions('contacts')), false) );

drop policy "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
for insert
with check ( coalesce((select can_add from public.get_my_module_permissions('contacts')), false) );

drop policy "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
for update
using (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
)
with check (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
);

drop policy "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
for delete
using ( coalesce((select can_delete from public.get_my_module_permissions('contacts')), false) );

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
begin
  select * into flags from public.get_my_module_permissions('contacts');

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

drop policy "contact_photos_write_can_add_or_edit" on storage.objects;
create policy "contact_photos_write_can_add_or_edit" on storage.objects
for insert
with check (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_module_permissions('contacts')), false)
    or coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  )
);

drop policy "contact_photos_update_can_add_or_edit" on storage.objects;
create policy "contact_photos_update_can_add_or_edit" on storage.objects
for update
using (
  bucket_id = 'contact-photos'
  and (
    coalesce((select can_add from public.get_my_module_permissions('contacts')), false)
    or coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  )
);

drop policy "contact_photos_delete_can_edit" on storage.objects;
create policy "contact_photos_delete_can_edit" on storage.objects
for delete
using (
  bucket_id = 'contact-photos'
  and coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
);

drop policy "company_events_write_platform_managers" on public.company_events;
create policy "company_events_write_platform_managers" on public.company_events
for insert
with check ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

drop policy "company_events_update_platform_managers" on public.company_events;
create policy "company_events_update_platform_managers" on public.company_events
for update
using ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) )
with check ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

drop policy "company_events_delete_platform_managers" on public.company_events;
create policy "company_events_delete_platform_managers" on public.company_events
for delete
using ( coalesce((select can_manage from public.get_my_module_permissions('activities')), false) );

-- 6. Drop the old flat columns and the old function (cutover complete)
alter table public.role_profiles
  drop column can_view,
  drop column can_add,
  drop column can_edit,
  drop column can_delete,
  drop column can_deactivate,
  drop column can_manage_platform;

drop function public.get_my_role_flags();

commit;
```

- [ ] **Step 5: Apply the migration — MANUAL STEP, hand SQL to the human**

The Supabase CLI is NOT linked on this machine (long-standing, known, separate blocker — same situation as every other migration already completed in this project). Do NOT run `npx supabase db push` or `npx supabase link`. Instead, report back with status NEEDS_CONTEXT and include the exact generated migration filename and the FULL SQL content verbatim, so a human can paste it into the Supabase dashboard SQL Editor. Do NOT commit anything yet.

- [ ] **Step 6: (finishing step, after human confirms) Run the FULL test suite, not just the two rewritten files, to confirm nothing regressed, then commit**

Run: `npm test`
Expected: ALL tests pass — this migration touches RLS for `role_profiles`, `app_users`, `companies`, `departments`, `contacts`, `contact-photos` storage, and `company_events`, so every existing integration test in `src/test/integration/` exercises a policy this migration rewrote. A regression anywhere in that surface means the migration introduced a behavior change and must be fixed before proceeding — do not skip straight to just the two new/rewritten tests.

```bash
git add supabase/migrations/<timestamp>_per_module_permissions.sql src/test/integration/roleProfiles.test.ts src/test/integration/contactsStatusPermission.test.ts
git commit -m "feat: replace flat role permissions with per-module permission matrix"
```

---

### Task 2: Update the sidebar and layout to per-module gating

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Update `layout.tsx` to call `get_my_permissions()` and build a per-module lookup**

Read the current `src/app/(app)/layout.tsx` first. Replace the single `get_my_role_flags()` call with `get_my_permissions()`, and build a `Record<string, boolean>` (module key → `can_manage`, plus `contacts` → `can_view`) to pass to `Sidebar`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./Sidebar";
import { logout } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = new Map((permissionRows ?? []).map((p) => [p.module_key, p]));

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar
        email={user?.email}
        canViewContacts={Boolean(permissions.get("contacts")?.can_view)}
        canManageUsers={Boolean(permissions.get("users")?.can_manage)}
        canManageRoleProfiles={Boolean(permissions.get("role_profiles")?.can_manage)}
        canManageCompanies={Boolean(permissions.get("companies")?.can_manage)}
        canManageDepartments={Boolean(permissions.get("departments")?.can_manage)}
        canManageActivities={Boolean(permissions.get("activities")?.can_manage)}
        onLogout={logout}
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Update `Sidebar.tsx` to accept per-module flags and show each link independently**

Read the current `src/app/(app)/Sidebar.tsx` first (it currently takes `canView`/`canManagePlatform` and builds `mainLinks`/`settingsLinks` arrays from those two booleans). Replace the props and the link-building logic so each entry is gated by its own flag instead of one shared `canManagePlatform`:

```tsx
export function Sidebar({
  email,
  canViewContacts,
  canManageUsers,
  canManageRoleProfiles,
  canManageCompanies,
  canManageDepartments,
  canManageActivities,
  onLogout,
}: {
  email?: string;
  canViewContacts: boolean;
  canManageUsers: boolean;
  canManageRoleProfiles: boolean;
  canManageCompanies: boolean;
  canManageDepartments: boolean;
  canManageActivities: boolean;
  onLogout: () => Promise<void>;
}) {
  // ...same useState/useEffect/toggle collapse logic, unchanged...

  const mainLinks: NavLink[] = [
    ...(canViewContacts ? [{ href: "/contacts", label: "Agenda de contactos", icon: BookUser }] : []),
    ...(canManageUsers ? [{ href: "/users", label: "Usuarios", icon: Users }] : []),
  ];

  const settingsLinks: NavLink[] = [
    ...(canManageRoleProfiles ? [{ href: "/role-profiles", label: "Perfiles de rol", icon: ShieldCheck }] : []),
    ...(canManageCompanies ? [{ href: "/companies", label: "Empresas", icon: Building2 }] : []),
    ...(canManageDepartments ? [{ href: "/departments", label: "Departamentos", icon: Network }] : []),
    ...(canManageActivities ? [{ href: "/activities", label: "Actividades", icon: PartyPopper }] : []),
  ];

  // ...rest of the component (the JSX render, the "Ajustes" heading shown when settingsLinks.length > 0, the collapse toggle, the logout button) stays exactly as it is today...
}
```

- [ ] **Step 3: Verify (adapted, see override below)**

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/layout.tsx src/app/(app)/Sidebar.tsx
git commit -m "feat: gate sidebar links by per-module permissions"
```

#### Override for Step 3

Cannot browser-test interactively. Run `npx tsc --noEmit` (no errors expected) and `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/` (expect a redirect, not a crash). This task's real effect (which links show for which users) can only be confirmed once Task 1's migration is live and a human logs in — defer that to the human's later pass.

---

### Task 3: Update Companies, Departments, Users, and Activities admin pages + the `inviteUser` action

**Files:**
- Modify: `src/app/(app)/(admin)/companies/page.tsx`
- Modify: `src/app/(app)/(admin)/departments/page.tsx`
- Modify: `src/app/(app)/(admin)/users/page.tsx`
- Modify: `src/app/(app)/(admin)/activities/page.tsx`
- Modify: `src/app/(app)/(admin)/users/actions.ts`
- Modify: `src/app/(app)/(admin)/users/actions.test.ts`

Each of the 4 admin pages currently has this exact pattern near the top:
```tsx
const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
if (!flagsRows?.[0]?.can_manage_platform) {
  redirect("/");
}
```
(the `users/page.tsx` variant stores it in a `flags` const first, same idea). Replace it in **all 4 files** with the module-specific call — same shape, one extra argument, and the flag is now `can_manage` instead of `can_manage_platform`:

- `companies/page.tsx`: `supabase.rpc("get_my_module_permissions", { p_module_key: "companies" })`, then `if (!flagsRows?.[0]?.can_manage) redirect("/");`
- `departments/page.tsx`: same with `"departments"`.
- `activities/page.tsx`: same with `"activities"`.
- `users/page.tsx`: same with `"users"` — this one assigns to a `flags` const reused later in the JSX (currently unused beyond the gate check — verify by reading the file; if `flags` isn't referenced again, the shape doesn't need to change beyond the rename).

- [ ] **Step 1: Update `companies/page.tsx`, `departments/page.tsx`, `activities/page.tsx`, `users/page.tsx`** as described above. Read each file in full before editing — don't guess at surrounding context.

- [ ] **Step 2: Update `users/actions.ts`'s `callerCanManagePlatform` helper**

`src/app/(app)/(admin)/users/actions.ts` — rename/adapt `callerCanManagePlatform` to check the `users` module:
```typescript
async function callerCanManageUsers(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "users" });
  return Boolean(data?.[0]?.can_manage);
}
```
Update the one call site inside `inviteUser` (`if (!(await callerCanManagePlatform()))`) to call the renamed function.

- [ ] **Step 3: Update `users/actions.test.ts`'s mock to match**

`src/app/(app)/(admin)/users/actions.test.ts` — the mock's `rpc` call doesn't care what function name is requested (it always resolves with the fixture regardless), but its fixture shape must match what the code now reads (`can_manage` instead of `can_manage_platform`):
```typescript
function mockServerClient(flags: { can_manage: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "caller-id" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: [flags], error: null }),
  };
}

describe("inviteUser", () => {
  it("rejects callers without can_manage on the users module", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockServerClient({ can_manage: false }) as never,
    );

    const result = await inviteUser({ email: "new@example.com", roleProfileId: "profile-1" });

    expect(result.error).toBe("No autorizado");
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the unit test and verify**

Run: `npx vitest run "src/app/(app)/(admin)/users/actions.test.ts"`
Expected: PASS (this test is fully mocked, no live database needed, should work immediately).

Then: `npx tsc --noEmit` (clean) and curl `/companies`, `/departments`, `/users`, `/activities` (expect redirects, not crashes — full behavior depends on Task 1's migration being live, same caveat as Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/(admin)/companies/page.tsx src/app/(app)/(admin)/departments/page.tsx src/app/(app)/(admin)/users/page.tsx src/app/(app)/(admin)/activities/page.tsx src/app/(app)/(admin)/users/actions.ts src/app/(app)/(admin)/users/actions.test.ts
git commit -m "feat: gate companies, departments, users, and activities pages by their own module"
```

---

### Task 4: Update the contacts pages to the `contacts` module

**Files:**
- Modify: `src/app/(app)/contacts/page.tsx`
- Modify: `src/app/(app)/contacts/new/page.tsx`
- Modify: `src/app/(app)/contacts/[id]/page.tsx`

All three currently call `supabase.rpc("get_my_role_flags")` and read `flags.can_view`/`can_add`/`can_edit`/`can_deactivate`/`can_delete`/`can_manage_platform` is NOT used here (contacts pages never checked platform-manage, only view/add/edit/deactivate/delete — verify this by reading each file). Replace each call with:
```tsx
const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", { p_module_key: "contacts" });
```
The rest of each file (`flags?.can_view`, `flags.can_add`, `flags.can_edit`, `flags.can_deactivate`, `flags.can_delete`) reads the **same field names** as before (`get_my_module_permissions` returns the same column names `get_my_role_flags` did, minus `can_manage_platform` which contacts pages never used) — so no other line should need to change besides the `rpc(...)` call itself. Read all 3 files in full first to confirm this assumption holds before editing; if any of them do reference `can_manage_platform`, stop and report NEEDS_CONTEXT rather than guessing what module that check should map to.

- [ ] **Step 1: Update `page.tsx`, `new/page.tsx`, `[id]/page.tsx`** as described.

- [ ] **Step 2: Verify**

Run `npx tsc --noEmit` (clean) and curl `/contacts`, `/contacts/new` (expect redirects, not crashes).

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/contacts/page.tsx src/app/(app)/contacts/new/page.tsx "src/app/(app)/contacts/[id]/page.tsx"
git commit -m "feat: gate contacts pages by the contacts module"
```

---

### Task 5: Rebuild the Role Profiles screen as a create/edit permission matrix

**Files:**
- Modify: `src/app/(app)/(admin)/role-profiles/page.tsx`
- Modify: `src/app/(app)/(admin)/role-profiles/actions.ts`
- Modify: `src/app/(app)/(admin)/role-profiles/RoleProfileForm.tsx`

This is the one screen whose UI meaningfully changes shape (not just a renamed RPC call) — read all 3 current files in full before starting, since the new versions replace most of their logic.

- [ ] **Step 1: Rewrite `actions.ts` to save a name plus a per-module permission matrix**

`src/app/(app)/(admin)/role-profiles/actions.ts`:
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
```

- [ ] **Step 2: Rewrite `page.tsx` — list profiles by name, fetch modules once, fetch each profile's permissions for the edit dialog**

`src/app/(app)/(admin)/role-profiles/page.tsx`:
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
                <RoleProfileForm
                  modules={modules ?? []}
                  initial={{
                    id: profile.id,
                    name: profile.name,
                    permissions: (profile.role_profile_permissions ?? []) as never,
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `RoleProfileForm.tsx` as a matrix inside the Dialog, supporting both create (no `initial`, shows a "Nuevo perfil" trigger button) and edit (has `initial`, shows a small "Editar" icon-button trigger)**

`src/app/(app)/(admin)/role-profiles/RoleProfileForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveRoleProfile, type ModulePermissionInput, type RoleProfileInput } from "./actions";

interface Module {
  id: string;
  key: string;
  label: string;
}

const PERMISSION_COLUMNS: { key: keyof Omit<ModulePermissionInput, "module_id">; label: string }[] = [
  { key: "can_view", label: "Ver" },
  { key: "can_add", label: "Agregar" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
  { key: "can_deactivate", label: "Anular" },
  { key: "can_manage", label: "Gestionar" },
  { key: "can_authorize", label: "Autorizar" },
];

function emptyPermissions(modules: Module[]): Record<string, ModulePermissionInput> {
  return Object.fromEntries(
    modules.map((m) => [
      m.id,
      {
        module_id: m.id,
        can_view: false,
        can_add: false,
        can_edit: false,
        can_delete: false,
        can_deactivate: false,
        can_manage: false,
        can_authorize: false,
      },
    ]),
  );
}

export function RoleProfileForm({
  modules,
  initial,
}: {
  modules: Module[];
  initial?: RoleProfileInput;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [permissions, setPermissions] = useState<Record<string, ModulePermissionInput>>(() => {
    const base = emptyPermissions(modules);
    for (const p of initial?.permissions ?? []) {
      base[p.module_id] = { ...base[p.module_id], ...p };
    }
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(moduleId: string, key: keyof Omit<ModulePermissionInput, "module_id">, value: boolean) {
    setPermissions((prev) => ({ ...prev, [moduleId]: { ...prev[moduleId], [key]: value } }));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveRoleProfile({
        id: initial?.id,
        name,
        permissions: Object.values(permissions),
      });
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) setName("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nuevo perfil</Button>
          )
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar perfil de rol" : "Nuevo perfil de rol"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                {PERMISSION_COLUMNS.map((col) => (
                  <TableHead key={col.key} className="text-center">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  {PERMISSION_COLUMNS.map((col) => (
                    <TableCell key={col.key} className="text-center">
                      <input
                        type="checkbox"
                        checked={permissions[m.id]?.[col.key] ?? false}
                        onChange={(e) => toggle(m.id, col.key, e.target.checked)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Manual verification (adapted, see override below)**

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/(admin)/role-profiles/page.tsx src/app/(app)/(admin)/role-profiles/actions.ts src/app/(app)/(admin)/role-profiles/RoleProfileForm.tsx
git commit -m "feat: rebuild role profiles screen as a per-module permission matrix"
```

#### Override for Step 4

Cannot browser-test interactively. Run `npx tsc --noEmit` (clean) and curl `/role-profiles` (expect a redirect, not a crash). Note this depends on Task 1's migration being live (the `role_profile_permissions` table and `modules` table must exist) — if `tsc` is clean and the route doesn't 500, that's sufficient for this task; full manual verification (opening the matrix, toggling checkboxes, saving, seeing it persist) is deferred to the human's later pass.

---

### Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1:** `npm test` — expect ALL tests passing (every integration test in `src/test/integration/` plus the `users/actions.test.ts` unit test).
- [ ] **Step 2:** `npx tsc --noEmit` — expect clean.
- [ ] **Step 3:** Smoke-curl `/`, `/login`, `/contacts`, `/users`, `/role-profiles`, `/companies`, `/departments`, `/activities` — all should respond with their expected redirect/200, no 500s.
- [ ] **Step 4:** Note for the human: the full end-to-end verification of the new permission matrix (creating a role profile with mixed per-module permissions, confirming a test user with that profile sees exactly the right sidebar links and can/can't do exactly the right actions per module) requires a live browser session and is the human's to drive.
