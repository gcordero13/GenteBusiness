# Contact Self-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in `app_user` edit their OWN contact's `position`, `extension`, `fleet_phone`, and `has_whatsapp`, even if their role profile's Agenda module permission is only "Ver" (view), matched by email between `app_users` and `contacts`.

**Architecture:** Relax the `contacts` RLS `select`/`update` policies and the `enforce_contacts_update_permissions()` trigger to add an `is_self` bypass scoped to exactly those four fields. Add a lightweight `SelfEditForm` component + server action for the self-service path, branch `/contacts/[id]/page.tsx` between full edit / self-edit / read-only, and add a `/my-profile` route + unconditional Sidebar link so users can find their own record.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (RLS + `security definer` functions/triggers), `@supabase/ssr`, Vitest integration tests against a live Supabase project.

---

### Task 1: Migration — relax RLS and the update-permissions trigger

**Files:**
- Create: `supabase/migrations/20260717120000_contacts_self_edit.sql`
- Test: `src/test/integration/contactsSelfEdit.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTestUser, deleteTestUser, type TestUser } from "./supabaseTestHelpers";

describe("contacts self-edit", () => {
  let viewer: TestUser | undefined;
  let companyId = "";
  let departmentId = "";
  let contactId = "";
  let extraProfileId = "";

  afterEach(async () => {
    const admin = createAdminClient();
    if (contactId) await admin.from("contacts").delete().eq("id", contactId);
    if (departmentId) await admin.from("departments").delete().eq("id", departmentId);
    if (companyId) await admin.from("companies").delete().eq("id", companyId);
    if (extraProfileId) await admin.from("role_profiles").delete().eq("id", extraProfileId);
    if (viewer) await deleteTestUser(viewer.id);
    viewer = undefined;
    companyId = "";
    departmentId = "";
    contactId = "";
    extraProfileId = "";
  });

  it("lets a Viewer (no can_edit) update position/extension/fleet_phone/has_whatsapp on their OWN contact", async () => {
    const admin = createAdminClient();
    viewer = await createTestUser("Viewer");

    const { data: company } = await admin.from("companies").insert({ name: "Self Edit Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Self Edit Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "Self",
        last_name: "Edit",
        email: viewer.email,
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { error } = await viewer.client
      .from("contacts")
      .update({ position: "Nuevo puesto", fleet_phone: "5551234", extension: "101", has_whatsapp: true })
      .eq("id", contactId);

    expect(error).toBeNull();
  });

  it("blocks a Viewer from editing OTHER fields on their own contact", async () => {
    const admin = createAdminClient();
    viewer = await createTestUser("Viewer");

    const { data: company } = await admin.from("companies").insert({ name: "Self Edit Co 2" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Self Edit Dept 2", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "Self",
        last_name: "Edit",
        email: viewer.email,
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { error } = await viewer.client.from("contacts").update({ first_name: "Hacked" }).eq("id", contactId);

    expect(error).not.toBeNull();
  });

  it("blocks a Viewer from editing someone else's contact, even changing only position", async () => {
    const admin = createAdminClient();
    viewer = await createTestUser("Viewer");

    const { data: company } = await admin.from("companies").insert({ name: "Self Edit Co 3" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "Self Edit Dept 3", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "Someone",
        last_name: "Else",
        email: "not-the-viewer@example.com",
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { error } = await viewer.client.from("contacts").update({ position: "Should fail" }).eq("id", contactId);

    expect(error).not.toBeNull();
  });

  it("lets a user with NO contacts permissions still SELECT and self-edit their own contact", async () => {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("role_profiles")
      .insert({ name: `No Access ${Date.now()}` })
      .select()
      .single();
    extraProfileId = profile!.id;

    const { data: contactsModule } = await admin.from("modules").select("id").eq("key", "contacts").single();

    await admin.from("role_profile_permissions").insert({
      role_profile_id: extraProfileId,
      module_id: contactsModule!.id,
      can_view: false,
      can_add: false,
      can_edit: false,
      can_delete: false,
      can_deactivate: false,
      can_manage: false,
      can_authorize: false,
    });

    viewer = await createTestUser("Viewer");
    await admin.from("app_users").update({ role_profile_id: extraProfileId }).eq("id", viewer.id);

    const { data: company } = await admin.from("companies").insert({ name: "No Access Co" }).select().single();
    companyId = company!.id;
    const { data: department } = await admin
      .from("departments")
      .insert({ name: "No Access Dept", company_id: companyId })
      .select()
      .single();
    departmentId = department!.id;

    const { data: contact } = await admin
      .from("contacts")
      .insert({
        first_name: "No",
        last_name: "Access",
        email: viewer.email,
        company_id: companyId,
        department_id: departmentId,
      })
      .select()
      .single();
    contactId = contact!.id;

    const { data: selected, error: selectError } = await viewer.client
      .from("contacts")
      .select("*")
      .eq("id", contactId);
    expect(selectError).toBeNull();
    expect(selected).toHaveLength(1);

    const { error: updateError } = await viewer.client
      .from("contacts")
      .update({ position: "My own title" })
      .eq("id", contactId);
    expect(updateError).toBeNull();
  });
});
```

Run: `npm run test -- contactsSelfEdit`
Expected: FAIL — the first, third, and fourth tests fail (self-edit currently blocked entirely; the "someone else's contact" test currently already passes but for the wrong reason until the policy exists, so re-check after the migration too).

- [ ] **Step 2: Generate the migration SQL**

```sql
begin;

drop policy "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
for select
using (
  coalesce((select can_view from public.get_my_module_permissions('contacts')), false)
  or email = (select email from public.app_users where id = auth.uid())
);

drop policy "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
for update
using (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
  or email = (select email from public.app_users where id = auth.uid())
)
with check (
  coalesce((select can_edit from public.get_my_module_permissions('contacts')), false)
  or coalesce((select can_deactivate from public.get_my_module_permissions('contacts')), false)
  or email = (select email from public.app_users where id = auth.uid())
);

create or replace function public.enforce_contacts_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  flags record;
  is_self boolean;
begin
  select * into flags from public.get_my_module_permissions('contacts');

  select exists (
    select 1 from public.app_users au
    where au.id = auth.uid() and au.email = old.email
  ) into is_self;

  if flags is null and not is_self then
    raise exception 'not authorized';
  end if;

  if new.status is distinct from old.status and not coalesce(flags.can_deactivate, false) then
    raise exception 'not authorized to change contact status';
  end if;

  if (
    new.position, new.fleet_phone, new.extension, new.has_whatsapp
  ) is distinct from (
    old.position, old.fleet_phone, old.extension, old.has_whatsapp
  ) and not (is_self or coalesce(flags.can_edit, false)) then
    raise exception 'not authorized to edit contact fields';
  end if;

  if (
    new.first_name, new.last_name, new.email, new.department_id, new.company_id,
    new.photo_url, new.reports_to_id, new.birth_date
  ) is distinct from (
    old.first_name, old.last_name, old.email, old.department_id, old.company_id,
    old.photo_url, old.reports_to_id, old.birth_date
  ) and not coalesce(flags.can_edit, false) then
    raise exception 'not authorized to edit contact fields';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

commit;
```

Save this to `supabase/migrations/20260717120000_contacts_self_edit.sql`. Read the existing `enforce_contacts_update_permissions()` and `contacts_select`/`contacts_update` policy definitions in `supabase/migrations/20260715120543_per_module_permissions.sql` first to confirm column names and the exact original trigger logic being replaced haven't drifted.

- [ ] **Step 3: Apply the migration**

Source env vars without printing secrets, then paste the SQL from Step 2 into the Supabase Dashboard SQL Editor (same "generate → human pastes → verify" pattern used for every prior migration in this project). After the human confirms it ran, verify with:

```bash
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/get_my_module_permissions" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_module_key": "contacts"}'
```

Expected: a JSON response (confirms the RPC still resolves; the policy/trigger changes aren't independently visible via this call but this confirms nothing broke at the schema level).

- [ ] **Step 4: Run the integration tests and verify they pass**

Run: `npm run test -- contactsSelfEdit`
Expected: PASS (all four tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260717120000_contacts_self_edit.sql src/test/integration/contactsSelfEdit.test.ts
git commit -m "feat: allow contacts to self-edit position, extension, and fleet phone"
```

---

### Task 2: Server action for the self-edit fields

**Files:**
- Modify: `src/app/(app)/contacts/actions.ts`

- [ ] **Step 1: Add the action**

Add to `src/app/(app)/contacts/actions.ts` (after `saveContact`):

```typescript
export interface OwnContactFieldsInput {
  id: string;
  position: string;
  fleet_phone: string;
  extension: string;
  has_whatsapp: boolean;
}

export async function updateOwnContactFields(input: OwnContactFieldsInput) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      position: input.position || null,
      fleet_phone: input.fleet_phone || null,
      extension: input.extension || null,
      has_whatsapp: input.has_whatsapp,
    })
    .eq("id", input.id);

  if (error) return { error: error.message };

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${input.id}`);
  return {};
}
```

- [ ] **Step 2: Manually verify no regressions**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/contacts/actions.ts
git commit -m "feat: add updateOwnContactFields server action"
```

---

### Task 3: SelfEditForm component

**Files:**
- Create: `src/app/(app)/contacts/SelfEditForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnContactFields } from "./actions";

export interface OwnContactFields {
  id: string;
  position: string;
  fleet_phone: string;
  extension: string;
  has_whatsapp: boolean;
}

export function SelfEditForm({ initial }: { initial: OwnContactFields }) {
  const [position, setPosition] = useState(initial.position);
  const [fleetPhone, setFleetPhone] = useState(initial.fleet_phone);
  const [extension, setExtension] = useState(initial.extension);
  const [hasWhatsapp, setHasWhatsapp] = useState(initial.has_whatsapp);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateOwnContactFields({
        id: initial.id,
        position,
        fleet_phone: fleetPhone,
        extension,
        has_whatsapp: hasWhatsapp,
      });
      setError(result.error ?? null);
      setSaved(!result.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Puedes editar tu puesto, extensión y teléfono de flota. Para cambiar otros datos,
        contacta a un administrador.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Guardado.</p>}
      <div className="space-y-1">
        <Label>Puesto</Label>
        <Input value={position} onChange={(e) => setPosition(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Extensión</Label>
        <Input value={extension} onChange={(e) => setExtension(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Teléfono de flota</Label>
        <Input value={fleetPhone} onChange={(e) => setFleetPhone(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasWhatsapp} onChange={(e) => setHasWhatsapp(e.target.checked)} />
        Tiene WhatsApp
      </label>
      <Button onClick={submit} disabled={isPending}>
        Guardar
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/contacts/SelfEditForm.tsx
git commit -m "feat: add SelfEditForm for self-service contact edits"
```

---

### Task 4: Branch `/contacts/[id]/page.tsx` between full edit, self-edit, and read-only

**Files:**
- Modify: `src/app/(app)/contacts/[id]/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `src/app/(app)/contacts/[id]/page.tsx` with:

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../ContactForm";
import { SelfEditForm } from "../SelfEditForm";
import { setContactStatus, deleteContact } from "../actions";
import { Button } from "@/components/ui/button";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  const flags = flagsRows?.[0];

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (!contact) notFound();

  const isSelf = Boolean(user?.email && contact.email && user.email === contact.email);

  if (!flags?.can_view && !isSelf) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .neq("id", id)
    .order("first_name");

  async function toggleStatus() {
    "use server";
    await setContactStatus(id, contact!.status === "active" ? "deactivated" : "active");
  }

  async function remove() {
    "use server";
    await deleteContact(id);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">Editar contacto</h1>
      {flags?.can_edit ? (
        <ContactForm
          companies={companies ?? []}
          departments={departments ?? []}
          supervisors={(existingContacts ?? []).map((c) => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
          }))}
          initial={{
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email ?? "",
            extension: contact.extension ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            has_whatsapp: contact.has_whatsapp,
            company_id: contact.company_id ?? "",
            department_id: contact.department_id ?? "",
            position: contact.position ?? "",
            birth_date: contact.birth_date ?? "",
            reports_to_id: contact.reports_to_id ?? "",
            photo_url: contact.photo_url ?? "",
          }}
        />
      ) : isSelf ? (
        <SelfEditForm
          initial={{
            id: contact.id,
            position: contact.position ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            extension: contact.extension ?? "",
            has_whatsapp: contact.has_whatsapp,
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No tienes permiso para editar este contacto.</p>
      )}
      <div className="flex gap-2">
        {flags?.can_deactivate && (
          <form action={toggleStatus}>
            <Button type="submit" variant="outline">
              {contact.status === "active" ? "Anular" : "Reactivar"}
            </Button>
          </form>
        )}
        {flags?.can_delete && (
          <form action={remove}>
            <Button type="submit" variant="destructive">
              Eliminar permanentemente
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
```

Note the key changes from the original: the `contact` fetch now happens *before* the permission gate (needed to compute `isSelf` from `contact.email`), the redirect condition became `!flags?.can_view && !isSelf`, and every `flags.xxx` access became `flags?.xxx` since `flags` may legitimately be `undefined` for a self-edit-only user with no module permissions row.

- [ ] **Step 2: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manual smoke test**

With the dev server running, log in as a user whose role profile has only "Ver" on Agenda, open `/contacts/<their-own-id>`, confirm the SelfEditForm renders (not the full ContactForm, not the read-only message) and saving position/extension/fleet_phone/WhatsApp works. Then open another contact's page and confirm the read-only message shows instead.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/contacts/\[id\]/page.tsx
git commit -m "feat: branch contact edit page between full edit, self-edit, and read-only"
```

---

### Task 5: `/my-profile` route and Sidebar link

**Files:**
- Create: `src/app/(app)/my-profile/page.tsx`
- Modify: `src/app/(app)/Sidebar.tsx`

- [ ] **Step 1: Write the my-profile page**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", user?.email ?? "")
    .maybeSingle();

  if (contact) {
    redirect(`/contacts/${contact.id}`);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Mi perfil</h1>
      <p className="text-sm text-muted-foreground">
        No encontramos un contacto en la agenda vinculado a tu correo. Pide a un administrador que
        te agregue.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add the Sidebar link**

Read `src/app/(app)/Sidebar.tsx` in full first to confirm the current `mainLinks` array shape and the lucide-react import block (already confirmed: `BookUser`, `Users` are in use; add `UserCircle`). Then:

- Add `UserCircle` to the existing lucide-react import list.
- Add `{ href: "/my-profile", label: "Mi perfil", icon: UserCircle }` as the first, unconditional entry in `mainLinks` (not gated by any `canView*`/`canManage*` flag — every authenticated user should see it).

- [ ] **Step 3: Manually verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Manual smoke test**

Log in, click "Mi perfil" in the sidebar, confirm it redirects to the logged-in user's own contact page (or shows the "no contact found" message if their email has no matching contact). Test on both desktop and mobile-drawer sidebar layouts.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/my-profile/page.tsx src/app/\(app\)/Sidebar.tsx
git commit -m "feat: add my-profile route and Sidebar link"
```

---

### Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass, including the existing `contactsStatusPermission.test.ts` and other RLS-integration tests (confirms the rewritten `contacts_select`/`contacts_update` policies and trigger didn't regress the existing can_view/can_edit/can_deactivate/can_delete behavior for non-self rows).

- [ ] **Step 2: Manual smoke test across roles**

Using the dev server, verify with at least three accounts (an Admin/Super-Admin-equivalent, a Viewer-only role, and a role with `can_edit` on Agenda):
- Admin can still fully edit any contact.
- `can_edit` role can still fully edit any contact.
- Viewer-only role can view all contacts, self-edit only their own position/extension/fleet_phone/WhatsApp, and sees the read-only message on everyone else's page.

- [ ] **Step 3: Commit (only if any fixes were needed in this task)**

If regressions were found and fixed, commit them individually per fix with a descriptive message. If nothing needed fixing, skip this step — there is nothing to commit.
