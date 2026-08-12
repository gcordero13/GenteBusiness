# Role Profile Delete (with Confirmation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `can_manage` admin delete a role profile from `/role-profiles`, behind a confirmation dialog, with two safety rules enforced at the database layer: "Super Admin" can never be deleted, and a profile still assigned to any user can't be deleted either.

**Architecture:** Both safety rules live in a new `BEFORE DELETE` trigger on `role_profiles` (the same pattern this codebase already uses for `enforce_contacts_update_permissions`), so they're enforced no matter what deletes the row and are directly testable via a Supabase client - unlike checks written only inside a `"use server"` function, which can't run outside a real Next.js request in this test environment. The server action itself just attempts the delete and passes through whatever error the trigger raises. A new `DeleteRoleProfileDialog.tsx` (copied from the existing `DeleteUserDialog.tsx` pattern) provides the confirmation UI.

**Tech Stack:** Next.js Server Components + Server Actions, Supabase (Postgres trigger + existing RLS), TypeScript, Vitest. This machine is missing `node.exe` - use `bun run test`/`bun run <script>` and `bunx tsc --noEmit`, never `npm`/`npx`.

**Spec:** `docs/superpowers/specs/2026-08-12-role-profile-delete-design.md`.

---

## File Structure

- **Create** `supabase/migrations/20260812110000_role_profiles_delete_restrictions.sql` - the `BEFORE DELETE` trigger enforcing both safety rules.
- **Modify** `src/test/integration/roleProfiles.test.ts` - new integration tests exercising the trigger and RLS directly.
- **Modify** `src/app/(app)/(admin)/role-profiles/actions.ts` - add `deleteRoleProfile`.
- **Create** `src/app/(app)/(admin)/role-profiles/DeleteRoleProfileDialog.tsx` - the confirmation dialog component.
- **Modify** `src/app/(app)/(admin)/role-profiles/page.tsx` - render the delete dialog next to the existing edit trigger.

---

## Task 1: Migration — `role_profiles` delete restrictions trigger

**Files:**
- Create: `supabase/migrations/20260812110000_role_profiles_delete_restrictions.sql`

This is additive: a new trigger function and trigger on an existing table. It doesn't alter any existing column, policy, or row.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260812110000_role_profiles_delete_restrictions.sql`:

```sql
-- Enforces two rules no matter what deletes a role_profiles row (the
-- deleteRoleProfile server action, a future admin script, anything):
-- "Super Admin" can never be deleted (this codebase's own seed/permission
-- logic resolves it by name in several places), and a profile still
-- assigned to at least one app_users row can't be deleted either - the
-- admin must reassign those users from the Users page first. Written as a
-- trigger (not application-code checks) so it's enforced everywhere and
-- directly testable via a plain Supabase client, matching the existing
-- enforce_contacts_update_permissions pattern in
-- supabase/migrations/20260730120000_contacts_self_edit.sql.
create or replace function public.enforce_role_profile_delete_restrictions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_count integer;
begin
  if old.name = 'Super Admin' then
    raise exception 'El perfil Super Admin no se puede eliminar.';
  end if;

  select count(*) into assigned_count from public.app_users where role_profile_id = old.id;
  if assigned_count > 0 then
    raise exception 'Este perfil tiene % usuario(s) asignado(s). Reasígnalos desde Usuarios antes de eliminarlo.', assigned_count;
  end if;

  return old;
end;
$$;

create trigger role_profiles_before_delete
  before delete on public.role_profiles
  for each row execute function public.enforce_role_profile_delete_restrictions();
```

- [ ] **Step 2: STOP - human confirmation required**

**STOP here.** Do not paste this SQL into Supabase yourself, and do not tell the human it has been applied. Just create the file and commit it (step 3), then report back clearly: "This migration file is written and committed but NOT applied. A human must paste the contents of `supabase/migrations/20260812110000_role_profiles_delete_restrictions.sql` into the Supabase SQL Editor and run it before Task 2 (the integration tests) can proceed." Do not attempt to apply it via any script, admin client, or Supabase CLI.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812110000_role_profiles_delete_restrictions.sql
git commit -m "feat: add role_profiles delete-restrictions trigger"
```

---

## Task 2: Integration tests for the trigger and RLS

**Files:**
- Modify: `src/test/integration/roleProfiles.test.ts`

**Do not start this task until Task 1's migration has been confirmed applied to the live database** - these tests exercise the real trigger.

The current full content of `src/test/integration/roleProfiles.test.ts` is:

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
    // Every profile should have exactly 13 rows (one per module) after migration.
    const byProfile = new Map<string, number>();
    for (const row of data ?? []) {
      const name = (row.role_profiles as unknown as { name: string }).name;
      byProfile.set(name, (byProfile.get(name) ?? 0) + 1);
    }
    expect(byProfile.get("Viewer")).toBe(13);
    expect(byProfile.get("Editor")).toBe(13);
    expect(byProfile.get("Super Admin")).toBe(13);
  });

  it("has the 13 expected modules", async () => {
    const admin = createAdminClient();
    const { data, error } = await admin.from("modules").select("key").order("key");

    expect(error).toBeNull();
    expect((data ?? []).map((m) => m.key).sort()).toEqual(
      [
        "activities",
        "attendance_devices",
        "companies",
        "contacts",
        "departments",
        "document_stamps",
        "maintenance",
        "ponchador",
        "role_profiles",
        "schedules",
        "settings",
        "solicitudes_vacaciones",
        "users",
      ].sort(),
    );
  });
});
```

- [ ] **Step 1: Add the new tests**

Append this new `describe` block to the end of `src/test/integration/roleProfiles.test.ts` (after the existing `describe("role_profile_permissions seed data", ...)` block's closing `});`):

```typescript
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("role_profiles delete restrictions", () => {
  let admin_user: TestUser | undefined;
  let viewer: TestUser | undefined;
  let createdProfileId: string | undefined;

  afterEach(async () => {
    const admin = createAdminClient();
    if (createdProfileId) {
      await admin.from("role_profiles").delete().eq("id", createdProfileId);
      createdProfileId = undefined;
    }
    if (admin_user) await deleteTestUser(admin_user.id);
    if (viewer) await deleteTestUser(viewer.id);
    admin_user = undefined;
    viewer = undefined;
  });

  it("lets a can_manage user delete an unassigned, non-Super-Admin profile, cascading its permission rows", async () => {
    admin_user = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: created } = await admin
      .from("role_profiles")
      .insert({ name: `Throwaway ${crypto.randomUUID()}` })
      .select()
      .single();
    createdProfileId = created!.id;

    const { error } = await admin_user.client.from("role_profiles").delete().eq("id", createdProfileId);
    expect(error).toBeNull();

    const { data: stillThere } = await admin.from("role_profiles").select("id").eq("id", createdProfileId).maybeSingle();
    expect(stillThere).toBeNull();

    const { data: leftoverPermissions } = await admin
      .from("role_profile_permissions")
      .select("id")
      .eq("role_profile_id", createdProfileId);
    expect(leftoverPermissions).toEqual([]);

    createdProfileId = undefined;
  });

  it("blocks deleting a profile that still has an assigned user", async () => {
    admin_user = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: created } = await admin
      .from("role_profiles")
      .insert({ name: `Throwaway ${crypto.randomUUID()}` })
      .select()
      .single();
    createdProfileId = created!.id;

    viewer = await createTestUser("Viewer");
    await admin.from("app_users").update({ role_profile_id: createdProfileId }).eq("id", viewer.id);

    const { error } = await admin_user.client.from("role_profiles").delete().eq("id", createdProfileId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("usuario(s) asignado(s)");

    const { data: stillThere } = await admin.from("role_profiles").select("id").eq("id", createdProfileId).maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("blocks deleting the Super Admin profile even with zero assigned users in a fresh check", async () => {
    admin_user = await createTestUser("Super Admin");
    const admin = createAdminClient();

    const { data: superAdminProfile } = await admin
      .from("role_profiles")
      .select("id")
      .eq("name", "Super Admin")
      .single();

    const { error } = await admin_user.client.from("role_profiles").delete().eq("id", superAdminProfile!.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Super Admin");

    const { data: stillThere } = await admin
      .from("role_profiles")
      .select("id")
      .eq("id", superAdminProfile!.id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("blocks a user without can_manage on role_profiles from deleting any profile", async () => {
    const admin = createAdminClient();
    const { data: created } = await admin
      .from("role_profiles")
      .insert({ name: `Throwaway ${crypto.randomUUID()}` })
      .select()
      .single();
    createdProfileId = created!.id;

    viewer = await createTestUser("Viewer");
    const { error } = await viewer.client.from("role_profiles").delete().eq("id", createdProfileId);
    // RLS silently excludes the row from the delete's target set rather than
    // raising an error - the row simply isn't affected.
    expect(error).toBeNull();

    const { data: stillThere } = await admin.from("role_profiles").select("id").eq("id", createdProfileId).maybeSingle();
    expect(stillThere).not.toBeNull();
  });
});
```

Also change the top of the file's import line from:

```typescript
import { describe, expect, it } from "vitest";
```

to:

```typescript
import { afterEach, describe, expect, it } from "vitest";
```

(The `import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";` line shown above the new `describe` block should go with the file's other imports, near the top, not inline where shown - place it directly below the existing `import { createAdminClient } from "@/lib/supabase/admin";` line.)

- [ ] **Step 2: Run the tests to verify they pass**

Run: `bun run test -- roleProfiles.test.ts`
Expected: PASS (6 tests - the existing 2, plus 4 new). If any of the 3 new trigger-dependent tests fail with an error that doesn't mention "Super Admin" or "usuario(s) asignado(s)" (e.g. the delete just silently succeeds), the migration from Task 1 likely hasn't actually been applied yet - stop and report BLOCKED rather than guessing at a workaround.

- [ ] **Step 3: Commit**

```bash
git add src/test/integration/roleProfiles.test.ts
git commit -m "test: add integration tests for role_profiles delete restrictions"
```

---

## Task 3: `deleteRoleProfile` server action

**Files:**
- Modify: `src/app/(app)/(admin)/role-profiles/actions.ts`

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
```

- [ ] **Step 1: Append the new action**

Append to `src/app/(app)/(admin)/role-profiles/actions.ts`:

```typescript

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

No new imports needed - `createClient` and `revalidatePath` are already imported at the top of this file.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/role-profiles/actions.ts"
git commit -m "feat: add deleteRoleProfile server action"
```

---

## Task 4: `DeleteRoleProfileDialog.tsx` component

**Files:**
- Create: `src/app/(app)/(admin)/role-profiles/DeleteRoleProfileDialog.tsx`

No test file - this codebase has no component-level tests anywhere (e.g. `DeleteUserDialog.tsx`, the component this one is modeled on, is also untested at this layer).

- [ ] **Step 1: Write the component**

Create `src/app/(app)/(admin)/role-profiles/DeleteRoleProfileDialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteRoleProfile } from "./actions";

export function DeleteRoleProfileDialog({ profileId, name }: { profileId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteRoleProfile(profileId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm">Eliminar</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar el perfil {name}?</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-sm text-muted-foreground">
          Esta acción no se puede deshacer. Se eliminarán también todos los permisos configurados para este perfil.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `bunx tsc --noEmit`
Expected: no errors. (Not imported anywhere yet - a real usage check happens in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/(admin)/role-profiles/DeleteRoleProfileDialog.tsx"
git commit -m "feat: add the DeleteRoleProfileDialog component"
```

---

## Task 5: Wire the delete dialog into `page.tsx`

**Files:**
- Modify: `src/app/(app)/(admin)/role-profiles/page.tsx`

This is the integration task tying Tasks 3 and 4 together.

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

- [ ] **Step 1: Add the import**

Change:

```typescript
import { RoleProfileForm } from "./RoleProfileForm";
```

to:

```typescript
import { RoleProfileForm } from "./RoleProfileForm";
import { DeleteRoleProfileDialog } from "./DeleteRoleProfileDialog";
```

- [ ] **Step 2: Wire in the delete dialog**

Change:

```tsx
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
```

to:

```tsx
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
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no errors.

Run: `bun run test`
Expected: all tests pass (aside from any pre-existing, unrelated Supabase-auth rate-limit flakiness - if a failure's message is exactly "Request rate limit reached" in a file this plan didn't touch, it's not a regression; re-run to confirm).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/(admin)/role-profiles/page.tsx"
git commit -m "feat: show the delete-profile dialog in the role profiles table"
```

---

## Self-Review Notes

- **Spec coverage:** Confirmation dialog reusing the `DeleteUserDialog` pattern → Task 4. "Super Admin never deletable" (button hidden + trigger-enforced) → Task 5's conditional render + Task 1's trigger. "Blocked if users assigned" → Task 1's trigger, tested in Task 2. `on delete cascade` cleanup of `role_profile_permissions` → already existing schema, verified by Task 2's first test. No new RLS policy → confirmed, `role_profiles_all_platform_managers`'s existing `for all` already covers DELETE, exercised by Task 2's fourth test.
- **Placeholder scan:** none found - every step has complete, concrete code.
- **Type consistency:** `deleteRoleProfile(id: string)` (Task 3) matches exactly how `DeleteRoleProfileDialog` (Task 4) calls it (`deleteRoleProfile(profileId)`, `profileId: string`), and matches how `page.tsx` (Task 5) passes `profile.id` (a string, per the existing `RoleProfileForm` usage's identical `profile.id` reference). Return shape `{error: string} | {}` matches `saveRoleProfile`'s existing shape, which `RoleProfileForm.tsx` already knows how to handle - no adaptation needed there since it's untouched by this plan.
- **Test-order safety:** Task 2's Super-Admin-deletion test operates on the real seeded "Super Admin" row but never actually deletes it (the trigger rejects the delete before anything is touched) - safe to run repeatedly and in any order relative to other tests.
