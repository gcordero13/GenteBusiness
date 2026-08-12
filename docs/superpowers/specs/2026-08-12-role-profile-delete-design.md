# Role Profile Delete (with Confirmation) — Design

## Context

"Perfiles de rol" (`/role-profiles`) already supports creating and editing profiles (name + full permission matrix) via `RoleProfileForm.tsx`. It has no delete capability at all today — no button, no server action. The only thing standing between a delete attempt and the database is a plain foreign-key constraint on `app_users.role_profile_id` (no `on delete cascade`), which would surface as a raw Postgres error if a delete were ever attempted against an assigned profile.

## Summary

Add a delete action to each role profile row, gated behind a confirmation dialog, following the exact pattern already established by `src/app/(app)/(admin)/users/DeleteUserDialog.tsx`. Two safety checks happen server-side before any row is actually deleted:

1. **Assigned users block the delete.** If any `app_users` row still references this profile, the delete is rejected with a message naming how many users are assigned and directing the admin to reassign them from the Users page first.
2. **"Super Admin" can never be deleted**, checked by name, regardless of whether it currently has assigned users. This profile is referenced by name in this codebase's own seed/permission logic (e.g. several migrations resolve "the default profile" via `where name = 'Super Admin'`), so removing it would break assumptions the app itself relies on. Its delete button doesn't render at all in the table — there's no dead-end click to explain.

**Both safety checks live in a database trigger, not in the server action.** This codebase's established pattern for "reject certain writes with a friendly message" is a `BEFORE`-trigger that raises an exception (see `enforce_contacts_update_permissions` in `supabase/migrations/20260730120000_contacts_self_edit.sql`), not application code inside the "use server" function. There are two concrete reasons to follow that pattern here rather than checking in `actions.ts`:

- **Testability.** This codebase's integration tests exercise RLS/trigger behavior by calling the Supabase client directly (`viewer.client.from(...).delete(...)`) - none of them invoke a "use server" function directly, because `createClient()` (`src/lib/supabase/server.ts`) depends on `next/headers`'s `cookies()`, which has no request scope to read from outside an actual Next.js request/response cycle. A check written only in `actions.ts` would be unreachable from an integration test.
- **Defense in depth.** A trigger enforces the rule no matter what calls `DELETE` on this table - the server action, a future admin script, or a bug that bypasses the action's own logic - the same guarantee `enforce_contacts_update_permissions` already gives the `contacts` table's protected fields.

## Migration — `role_profiles` delete restrictions

```sql
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

(Illustrative - the exact migration file, with a proper timestamped name, is written during implementation, following this codebase's established pattern of pasting a migration into Supabase's SQL Editor only when the plan explicitly says it's ready, with a STOP for human confirmation.)

`role_profile_permissions.role_profile_id` already has `on delete cascade`, so once the trigger allows a delete through, the profile's own permission rows are cleaned up automatically - no change needed there. `app_users.role_profile_id`'s existing (cascade-less) foreign key remains as a second backstop, now redundant with the trigger's own assigned-user check but harmless to leave in place.

## `src/app/(app)/(admin)/role-profiles/actions.ts` — new server action

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

Simple by design - both safety checks happen in the trigger above, so this action only needs to attempt the delete and surface whatever message comes back (the trigger's own `raise exception` text becomes `error.message`, the same way `enforce_contacts_update_permissions`'s messages already surface through existing contact-editing error handling).

Matches `saveRoleProfile`'s existing return shape (`{error: string}` or `{}`) and its `revalidatePath("/role-profiles")` convention exactly.

## `src/app/(app)/(admin)/role-profiles/DeleteRoleProfileDialog.tsx` — new component

A direct copy of `DeleteUserDialog.tsx`'s structure (Dialog + `useTransition` + error state), adapted for a role profile:

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

The confirmation body text only describes what the delete itself does (removing the profile's permission rows via cascade) - it doesn't mention assigned users, since that case is already rejected server-side with its own inline error message before any row is touched.

## `src/app/(app)/(admin)/role-profiles/page.tsx` — wire it in

The existing single-cell action column changes from a bare `<RoleProfileForm .../>` to a `flex` row holding both the existing edit trigger and the new delete dialog, matching `users/page.tsx`'s established `flex flex-wrap justify-end gap-2` layout for multi-action cells:

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

## Testing

Integration tests in `src/test/integration/roleProfiles.test.ts` (extending the existing file), exercising the trigger and RLS directly through a Supabase client the same way every other RLS/trigger test in this codebase does (e.g. `contactsSelfEdit.test.ts`) - not by calling `deleteRoleProfile` itself, since "use server" functions can't run outside a real request scope in this test environment:

- A `can_manage` (Super Admin) test user's client can delete a freshly-created, unassigned, non-"Super Admin" role profile - the row and its `role_profile_permissions` rows are both gone afterward (cascade), confirmed by re-querying both tables.
- Deleting a freshly-created role profile that has at least one `app_users` row assigned to it is rejected: the delete call returns a Postgres error whose message contains "usuario(s) asignado(s)"; the profile still exists afterward.
- Deleting the real "Super Admin" profile (looked up by name - `role_profiles.name` is `unique`, so there's exactly one such row) is rejected with an error mentioning "Super Admin". This is safe to run against the real row: the trigger's name check runs before its assigned-user check and before any row is actually removed, so the delete is rejected regardless of how many users currently have that profile - nothing is ever touched either way.
- A user without `can_manage` on `role_profiles` cannot delete any profile at all (the existing `role_profiles_all_platform_managers` RLS policy already covers this for every operation; this test confirms it specifically for delete, since existing tests may only cover select/insert/update).

No new RLS policy needed - `role_profiles_all_platform_managers`'s `for all` already includes DELETE. The trigger runs *in addition to* RLS, not instead of it: a non-`can_manage` user's delete attempt is already blocked by RLS before the trigger would even run.

## Out of Scope

- Any UI for reassigning users away from a profile in bulk (the error message just points the admin at the existing Users page, where profiles are already changed one user at a time).
- A generic "protected profiles" marker column - only "Super Admin" is protected, and it's checked by exact name, consistent with how this codebase already resolves it elsewhere (by name, not by a flag).
