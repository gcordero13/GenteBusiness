# Role Profile Delete (with Confirmation) — Design

## Context

"Perfiles de rol" (`/role-profiles`) already supports creating and editing profiles (name + full permission matrix) via `RoleProfileForm.tsx`. It has no delete capability at all today — no button, no server action. The only thing standing between a delete attempt and the database is a plain foreign-key constraint on `app_users.role_profile_id` (no `on delete cascade`), which would surface as a raw Postgres error if a delete were ever attempted against an assigned profile.

## Summary

Add a delete action to each role profile row, gated behind a confirmation dialog, following the exact pattern already established by `src/app/(app)/(admin)/users/DeleteUserDialog.tsx`. Two safety checks happen server-side before any row is actually deleted:

1. **Assigned users block the delete.** If any `app_users` row still references this profile, the delete is rejected with a message naming how many users are assigned and directing the admin to reassign them from the Users page first.
2. **"Super Admin" can never be deleted**, checked by name, regardless of whether it currently has assigned users. This profile is referenced by name in this codebase's own seed/permission logic (e.g. several migrations resolve "the default profile" via `where name = 'Super Admin'`), so removing it would break assumptions the app itself relies on. Its delete button doesn't render at all in the table — there's no dead-end click to explain.

No new migration: `role_profile_permissions.role_profile_id` already has `on delete cascade`, so a successful profile delete cleans up its own permission rows automatically. `app_users.role_profile_id`'s existing (cascade-less) foreign key is also kept as a defense-in-depth backstop in case the app-level user count check is ever bypassed.

## `src/app/(app)/(admin)/role-profiles/actions.ts` — new server action

```typescript
export async function deleteRoleProfile(id: string) {
  const supabase = await createClient();

  const { data: profile } = await supabase.from("role_profiles").select("name").eq("id", id).single();
  if (profile?.name === "Super Admin") {
    return { error: "El perfil Super Admin no se puede eliminar." };
  }

  const { count } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role_profile_id", id);
  if (count && count > 0) {
    const plural = count === 1 ? "" : "s";
    return {
      error: `Este perfil tiene ${count} usuario${plural} asignado${plural}. Reasígnalos desde Usuarios antes de eliminarlo.`,
    };
  }

  const { error } = await supabase.from("role_profiles").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/role-profiles");
  return {};
}
```

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

Integration tests in `src/test/integration/roleProfiles.test.ts` (extending the existing file):

- A `can_manage` user can delete a role profile that has no assigned users and isn't "Super Admin" - the row and its `role_profile_permissions` rows are both gone afterward (cascade).
- Deleting a role profile that has at least one assigned `app_users` row is rejected with an error mentioning the assigned-user count; the profile still exists afterward.
- Deleting the "Super Admin" profile is rejected. `role_profiles.name` has a `unique` constraint, so there's exactly one such row (the real seeded one) - the test looks up its real id and calls `deleteRoleProfile` on it. This is safe to run against the real row: the action's name check runs *before* the assigned-user check or any actual delete, so the call returns the "cannot be deleted" error immediately regardless of how many users currently have that profile, and nothing is ever touched.
- A user without `can_manage` on `role_profiles` cannot delete any profile (existing RLS policy already covers this - a `for all` policy scoped to `can_manage`; this test just confirms delete specifically, not only select/insert/update which existing tests may already cover).

No new RLS policy needed - `role_profiles_all_platform_managers`'s `for all` already includes DELETE.

## Out of Scope

- Any UI for reassigning users away from a profile in bulk (the error message just points the admin at the existing Users page, where profiles are already changed one user at a time).
- A generic "protected profiles" marker column - only "Super Admin" is protected, and it's checked by exact name, consistent with how this codebase already resolves it elsewhere (by name, not by a flag).
